"use client";

import useSWR from "swr";
import { useMemo } from "react";
import type { ScheduleRow } from "@/lib/types";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

const DAY = 86400000;

function parse(iso: string) {
  return new Date(iso + "T12:00:00").getTime();
}

function fmtShort(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type Group = {
  product: string;
  rows: ScheduleRow[];
  pct: number;
  finish: string;
  late: number;
};

export function ScheduleGantt() {
  const { data, error } = useSWR<{ items: ScheduleRow[]; error?: string }>("/api/schedule", fetcher);
  const items = data?.items ?? [];

  const view = useMemo(() => {
    if (items.length === 0) return null;
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const todayMs = today.getTime();

    const starts = items.map((r) => parse(r.start));
    const ends = items.map((r) => parse(r.end));
    const min = new Date(Math.min(...starts, todayMs));
    const max = new Date(Math.max(...ends, todayMs));
    const rangeStart = new Date(min.getFullYear(), min.getMonth(), 1).getTime();
    const rangeEnd = new Date(max.getFullYear(), max.getMonth() + 1, 1).getTime();
    const span = rangeEnd - rangeStart;
    const pos = (ms: number) => ((ms - rangeStart) / span) * 100;

    const months: { label: string; left: number; width: number }[] = [];
    const cur = new Date(rangeStart);
    while (cur.getTime() < rangeEnd) {
      const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      const label =
        cur.getMonth() === 0 || months.length === 0
          ? cur.toLocaleDateString("en-US", { month: "short", year: "2-digit" }).replace(" ", " '")
          : cur.toLocaleDateString("en-US", { month: "short" });
      months.push({ label, left: pos(cur.getTime()), width: pos(next.getTime()) - pos(cur.getTime()) });
      cur.setTime(next.getTime());
    }

    const order: string[] = [];
    for (const r of items) if (!order.includes(r.product)) order.push(r.product);
    const groups: Group[] = order.map((product) => {
      const rows = items.filter((r) => r.product === product);
      let w = 0;
      let done = 0;
      for (const r of rows) {
        const d = Math.max(1, (parse(r.end) - parse(r.start)) / DAY);
        w += d;
        done += d * (r.pct / 100);
      }
      const finish = rows.reduce((a, r) => (r.end > a ? r.end : a), rows[0].end);
      const late = rows.filter((r) => parse(r.end) < todayMs && r.pct < 100).length;
      return { product, rows, pct: w ? (done / w) * 100 : 0, finish, late };
    });

    return { groups, months, pos, todayMs, todayLeft: pos(todayMs) };
  }, [items]);

  return (
    <div className="rounded-2xl bg-white border border-stone-200 p-4 shadow-sm h-full min-h-0 flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h2 className="text-lg font-semibold text-stone-800">Product development: critical path</h2>
          <div className="text-xs text-stone-500">From the &ldquo;Schedule&rdquo; tab of the dashboard Google Sheet</div>
        </div>
        <div className="flex items-center gap-3 text-xs text-stone-600 shrink-0">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-2.5 rounded-sm bg-red-600" /> Critical
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-2.5 rounded-sm bg-stone-400" /> Other
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-2.5 rounded-sm bg-red-200 ring-1 ring-inset ring-red-400" /> Remaining
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-0.5 h-3.5 bg-sky-600" /> Today
          </span>
        </div>
      </div>

      {!view ? (
        <div className="flex-1 flex items-center justify-center text-stone-400">
          {error || data?.error ? "Couldn't load the Schedule tab" : data ? "No tasks in the Schedule tab yet" : "Loading…"}
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Month header */}
          <div className="flex text-xs text-stone-500">
            <div className="w-[34%] shrink-0" />
            <div className="relative flex-1 h-5">
              {view.months.map((m) => (
                <div
                  key={m.left}
                  className="absolute top-0 h-full border-l border-stone-200 pl-1 truncate"
                  style={{ left: `${m.left}%`, width: `${m.width}%` }}
                >
                  {m.label}
                </div>
              ))}
            </div>
          </div>

          {/* Body */}
          <div className="relative flex-1 min-h-0 flex flex-col">
            {/* Gridlines + today line, drawn behind the rows */}
            <div className="pointer-events-none absolute inset-0 flex">
              <div className="w-[34%] shrink-0" />
              <div className="relative flex-1">
                {view.months.map((m) => (
                  <div key={m.left} className="absolute top-0 bottom-0 border-l border-stone-100" style={{ left: `${m.left}%` }} />
                ))}
                <div className="absolute top-0 bottom-0 w-0.5 bg-sky-600 z-10" style={{ left: `${view.todayLeft}%` }} />
              </div>
            </div>

            {view.groups.map((g) => (
              <div key={g.product} className="flex flex-col flex-1 min-h-0">
                <div className="flex items-baseline gap-3 border-b border-stone-200 pt-1.5 pb-1 bg-white/80 relative z-20">
                  <span className="text-base font-semibold text-stone-800">{g.product}</span>
                  <span className="text-xs text-stone-500 tabular-nums">
                    {Math.round(g.pct)}% complete · finish {fmtShort(g.finish)}
                  </span>
                  {g.late > 0 && (
                    <span className="text-xs font-semibold text-white bg-red-600 rounded px-1.5 py-0.5">
                      {g.late} late
                    </span>
                  )}
                </div>
                {g.rows.map((r, i) => {
                  const s = parse(r.start);
                  const e = parse(r.end);
                  const milestone = r.start === r.end;
                  const left = view.pos(s);
                  const width = Math.max(0.6, view.pos(e + DAY) - left);
                  const late = e < view.todayMs && r.pct < 100;
                  const doneColor = r.critical ? "bg-red-600" : "bg-stone-400";
                  const restColor = r.critical ? "bg-red-200 ring-1 ring-inset ring-red-400" : "bg-stone-300";
                  return (
                    <div key={i} className="flex items-center flex-1 min-h-[18px]">
                      <div className="w-[34%] shrink-0 pr-2 flex items-center gap-1.5 min-w-0">
                        {r.critical && <span className="w-1.5 h-1.5 rounded-full bg-red-600 shrink-0" />}
                        <span
                          className={
                            "text-[13px] leading-tight truncate " +
                            (r.pct >= 100 ? "text-stone-400 line-through" : r.critical ? "text-stone-900 font-medium" : "text-stone-600")
                          }
                          title={r.notes || r.task}
                        >
                          {r.task}
                        </span>
                        {r.owner && <span className="text-[11px] text-stone-400 truncate shrink-0">· {r.owner}</span>}
                        {late && <span className="text-[10px] font-bold text-red-600 shrink-0">LATE</span>}
                      </div>
                      <div className="relative flex-1 h-full">
                        {milestone ? (
                          <div
                            className="absolute top-1/2 flex items-center gap-1"
                            style={{ left: `${left}%`, transform: "translate(-50%, -50%)" }}
                          >
                            <span
                              className={
                                "block w-3 h-3 rotate-45 " +
                                (r.pct >= 100 ? doneColor : r.critical ? "bg-white ring-2 ring-red-600" : "bg-white ring-2 ring-stone-400")
                              }
                            />
                            <span className="text-[11px] text-stone-600 tabular-nums whitespace-nowrap pl-1">{fmtShort(r.end)}</span>
                          </div>
                        ) : (
                          <div
                            className={"absolute top-1/2 -translate-y-1/2 h-[60%] max-h-4 min-h-[8px] rounded-sm overflow-hidden " + restColor}
                            style={{ left: `${left}%`, width: `${width}%` }}
                            title={`${fmtShort(r.start)} – ${fmtShort(r.end)} · ${Math.round(r.pct)}%`}
                          >
                            <div className={"h-full " + doneColor} style={{ width: `${r.pct}%` }} />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
