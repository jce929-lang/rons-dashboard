"use client";

import useSWR from "swr";
import { useMemo, useState } from "react";
import type { CpmResult, CpmTask } from "@/lib/cpm";
import { isWorkingDay } from "@/lib/cpm";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

const DAY = 86400000;
const toMs = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const fmtShort = (iso: string) =>
  new Date(toMs(iso)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const BAR = { Critical: "bg-red-600", Ok: "bg-stone-400", Done: "bg-emerald-600" } as const;

export function LightweldGantt({ reserveRight = 0 }: { reserveRight?: number }) {
  const { data, error, mutate } = useSWR<CpmResult & { error?: string }>("/api/lightweld", fetcher);
  const [saving, setSaving] = useState<number | null>(null);
  const today = todayIso();

  const view = useMemo(() => {
    if (!data?.tasks?.length) return null;
    const t = data.tasks;
    const first = [data.projectStart, ...t.map((x) => x.start)].sort()[0];
    const last = [data.completion, today, ...t.map((x) => x.finish), ...t.map((x) => x.due).filter(Boolean)].sort().at(-1)!;
    const startMs = toMs(first);
    // a little room after the last date, more if a "+Nd past due" label has to fit there
    const anyPastDue = t.some((x) => x.status !== "Done" && (x.pastDue ?? 0) > 0);
    const endMs = toMs(last) + (anyPastDue ? 7 : 2) * DAY;
    const days: { iso: string; work: boolean; monday: boolean }[] = [];
    for (let m = startMs; m < endMs; m += DAY) {
      const iso = toIso(m);
      days.push({ iso, work: isWorkingDay(iso, data.nonWorking), monday: new Date(m).getUTCDay() === 1 });
    }
    const span = endMs - startMs;
    const pos = (iso: string, plusDays = 0) => ((toMs(iso) + plusDays * DAY - startMs) / span) * 100;
    const done = t.filter((x) => x.status === "Done").length;
    const late = t.filter((x) => x.status !== "Done" && x.finish < today).length;
    return { days, pos, done, late, dayWidth: 100 / days.length };
  }, [data, today]);

  async function toggle(task: CpmTask) {
    const done = task.status !== "Done";
    setSaving(task.id);
    await fetch("/api/lightweld", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: task.id, done, date: today }),
    });
    await mutate();
    setSaving(null);
  }

  return (
    <div className="rounded-2xl bg-white border border-stone-200 p-4 shadow-sm h-full min-h-0 flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-1.5" style={{ paddingRight: reserveRight }}>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-stone-800">LightWELD booth: critical path</h2>
          <div className="text-xs text-stone-500 tabular-nums">
            {data?.tasks?.length && view ? (
              <>
                {view.done}/{data.tasks.length} tasks done · finish {fmtShort(data.completion)} ({Math.ceil(data.durationDays)}{" "}
                working days) · critical path {data.criticalPath.join(" → ") || "none"}
              </>
            ) : (
              <>From the &ldquo;LightWELD&rdquo; tab of the dashboard Google Sheet</>
            )}
          </div>
        </div>
        {view && view.late > 0 && (
          <span className="shrink-0 text-xs font-semibold text-white bg-red-600 rounded px-1.5 py-0.5">{view.late} late</span>
        )}
      </div>

      {!view || !data ? (
        <div className="flex-1 flex items-center justify-center text-stone-400">
          {error || data?.error ? "Couldn't load the LightWELD tab" : data ? "No tasks in the LightWELD tab yet" : "Loading…"}
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Date header: a label on each Monday */}
          <div className="flex text-[11px] text-stone-500">
            <div className="w-[40%] shrink-0" />
            <div className="relative flex-1 h-4">
              {view.days.map((d) =>
                d.monday ? (
                  <div key={d.iso} className="absolute top-0 pl-0.5 whitespace-nowrap tabular-nums" style={{ left: `${view.pos(d.iso)}%` }}>
                    {fmtShort(d.iso)}
                  </div>
                ) : null
              )}
            </div>
          </div>

          <div className="relative flex-1 min-h-0 flex flex-col">
            {/* Background: weekends shaded, week lines, today line */}
            <div className="pointer-events-none absolute inset-0 flex">
              <div className="w-[40%] shrink-0" />
              <div className="relative flex-1">
                {view.days.map((d) =>
                  !d.work ? (
                    <div key={d.iso} className="absolute top-0 bottom-0 bg-stone-100" style={{ left: `${view.pos(d.iso)}%`, width: `${view.dayWidth}%` }} />
                  ) : d.monday ? (
                    <div key={d.iso} className="absolute top-0 bottom-0 border-l border-stone-200" style={{ left: `${view.pos(d.iso)}%` }} />
                  ) : null
                )}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-sky-600 z-10"
                  style={{ left: `${view.pos(today, 0.5)}%` }}
                  title={`Today, ${fmtShort(today)}`}
                />
              </div>
            </div>

            {data.tasks.map((t) => {
              const isDone = t.status === "Done";
              const late = !isDone && t.finish < today;
              const pastDue = !isDone && t.pastDue != null && t.pastDue > 0;
              const left = view.pos(t.start);
              const width = Math.max(view.dayWidth * 0.5, view.pos(t.finish, 1) - left);
              return (
                <div key={t.id} className="relative flex items-center flex-1 min-h-[15px] border-b border-stone-100/70">
                  <div className="w-[40%] shrink-0 pr-2 flex items-center gap-1.5 min-w-0">
                    <button
                      onClick={() => toggle(t)}
                      disabled={saving === t.id}
                      aria-pressed={isDone}
                      title={isDone ? `Done ${fmtShort(t.actualFinish)} - click to undo` : "Mark done today"}
                      className={
                        "w-3.5 h-3.5 rounded-[3px] border shrink-0 flex items-center justify-center disabled:opacity-40 " +
                        (isDone ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-stone-400 hover:border-stone-700")
                      }
                    >
                      {isDone && (
                        <svg viewBox="0 0 20 20" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={4}>
                          <path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                    <span className="text-[11px] tabular-nums text-stone-400 w-4 text-right shrink-0">{t.id}</span>
                    <span
                      className={
                        "text-[12px] leading-tight truncate " +
                        (isDone ? "text-stone-400 line-through" : t.status === "Critical" ? "text-stone-900 font-medium" : "text-stone-600")
                      }
                      title={`${t.id}. ${t.task}${t.owner ? ` · ${t.owner}` : ""}${t.preds.length ? ` · after ${t.preds.join(", ")}` : ""}`}
                    >
                      {t.task}
                    </span>
                    {t.owner && <span className="text-[10px] text-stone-400 truncate shrink-[2] min-w-[24px]">{t.owner}</span>}
                    {late && <span className="text-[9px] font-bold text-red-600 shrink-0">LATE</span>}
                  </div>
                  <div className="relative flex-1 h-full">
                    <div
                      className={"absolute top-1/2 -translate-y-1/2 h-[55%] max-h-3 min-h-[6px] rounded-[3px] " + BAR[t.status]}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={`${fmtShort(t.start)} – ${fmtShort(t.finish)} · ${t.duration} day${t.duration === 1 ? "" : "s"}${
                        t.status === "Done" ? " · done" : ` · slack ${t.slack}`
                      }${t.due ? ` · due ${fmtShort(t.due)}` : ""}`}
                    />
                    {t.due && (
                      <span
                        className={
                          "absolute top-1/2 w-2 h-2 rotate-45 ring-1 " +
                          (pastDue ? "bg-red-600 ring-white" : "bg-white ring-stone-700")
                        }
                        style={{ left: `${view.pos(t.due, 0.5)}%`, transform: "translate(-50%, -50%) rotate(45deg)" }}
                        title={`Due ${fmtShort(t.due)}`}
                      />
                    )}
                    {pastDue && (
                      <span
                        className="absolute top-1/2 -translate-y-1/2 text-[10px] font-semibold text-red-600 whitespace-nowrap pl-1.5"
                        style={{ left: `${Math.max(view.pos(t.finish, 1), view.pos(t.due, 1))}%` }}
                      >
                        +{t.pastDue}d past due
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3 pt-1.5 text-[11px] text-stone-600">
            <span className="flex items-center gap-1.5"><span className="w-4 h-2 rounded-sm bg-red-600" /> Critical</span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-2 rounded-sm bg-stone-400" /> Has slack</span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-2 rounded-sm bg-emerald-600" /> Done</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rotate-45 bg-white ring-1 ring-stone-700" /> Due date</span>
            <span className="flex items-center gap-1.5"><span className="w-0.5 h-3 bg-sky-600" /> Today</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-stone-100 border border-stone-200" /> Weekend</span>
            <span className="ml-auto text-stone-400">Click a box to mark a task done</span>
          </div>
        </div>
      )}
    </div>
  );
}
