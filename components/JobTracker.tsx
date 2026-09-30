"use client";

import useSWR from "swr";
import { useMemo, useState } from "react";
import type { ShopJob } from "@/lib/types";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

function fmtDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00");
  if (isNaN(+d)) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const family = (job: string) => job.split("-")[0];
const isComplete = (j: ShopJob) => j.ops.length > 0 && j.ops.every((o) => o.done);

function Check({ on }: { on: boolean }) {
  return (
    <span
      className={
        "inline-flex items-center justify-center w-5 h-5 rounded border-2 shrink-0 " +
        (on ? "bg-white border-white text-emerald-700" : "bg-white border-stone-400")
      }
    >
      {on && (
        <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={3.5}>
          <path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

export function JobTracker() {
  const { data, error, mutate } = useSWR<{ items: ShopJob[]; error?: string }>("/api/jobs", fetcher);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ job: "", part: "", desc: "", qty: "", due: "", ops: "" });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const items = data?.items ?? [];
  const today = todayIso();

  const groups = useMemo(() => {
    const map = new Map<string, ShopJob[]>();
    for (const j of items) {
      const f = family(j.job);
      map.set(f, [...(map.get(f) ?? []), j]);
    }
    return [...map.entries()].map(([fam, jobs]) => {
      const top = jobs.find((j) => !j.parent) ?? jobs[0];
      const ops = jobs.flatMap((j) => j.ops);
      return { fam, jobs, top, done: ops.filter((o) => o.done).length, total: ops.length };
    });
  }, [items]);

  const open = items.filter((j) => !isComplete(j)).length;
  const finished = items.length - open;
  const opsDone = items.reduce((s, j) => s + j.ops.filter((o) => o.done).length, 0);
  const opsTotal = items.reduce((s, j) => s + j.ops.length, 0);

  async function toggle(j: ShopJob, op: number) {
    const cur = j.ops.find((o) => o.op === op);
    if (!cur) return;
    const done = !cur.done;
    mutate(
      (d) =>
        d && {
          ...d,
          items: d.items.map((x) =>
            x.job === j.job ? { ...x, ops: x.ops.map((o) => (o.op === op ? { ...o, done } : o)) } : x
          ),
        },
      { revalidate: false }
    );
    await fetch("/api/jobs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job: j.job, op, done }),
    });
    mutate();
  }

  async function post(payload: object) {
    const r = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const res = await r.json().catch(() => ({}));
    return { ok: r.ok, res };
  }

  async function addJob() {
    setBusy(true);
    setMsg("");
    const { ok, res } = await post({
      action: "add",
      ...form,
      ops: form.ops.split(",").map((s) => s.trim()).filter(Boolean),
    });
    setBusy(false);
    if (!ok) return setMsg(res.error || "Couldn't add job");
    setForm({ job: "", part: "", desc: "", qty: "", due: "", ops: "" });
    mutate();
  }

  async function clearFinished() {
    setBusy(true);
    await post({ action: "archiveCompleted" });
    setBusy(false);
    mutate();
  }

  const input = "rounded-md border border-stone-300 px-2 py-1 text-sm";

  return (
    <div className="rounded-2xl bg-white border border-stone-200 p-4 shadow-sm h-full min-h-0 flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h2 className="text-lg font-semibold text-stone-800">Shop job releases</h2>
          <div className="text-xs text-stone-500 tabular-nums">
            {open} open jobs · {finished} finished · {opsDone}/{opsTotal} operations done
          </div>
        </div>
        <div className="flex items-center gap-2">
          {finished > 0 && (
            <button
              onClick={clearFinished}
              disabled={busy}
              className="rounded-md px-3 py-1 text-xs font-medium border bg-white text-stone-600 border-stone-300 hover:bg-stone-50 disabled:opacity-50"
            >
              Clear finished
            </button>
          )}
          <button
            onClick={() => {
              setAdding((a) => !a);
              setMsg("");
            }}
            className={
              "rounded-md px-3 py-1 text-xs font-medium border " +
              (adding ? "bg-stone-800 text-white border-stone-800" : "bg-white text-stone-600 border-stone-300 hover:bg-stone-50")
            }
          >
            {adding ? "Done adding" : "+ Add job"}
          </button>
        </div>
      </div>

      {adding && (
        <form
          className="grid grid-cols-6 gap-2 mb-2 p-2 rounded-lg bg-stone-50 border border-stone-200"
          onSubmit={(e) => {
            e.preventDefault();
            addJob();
          }}
        >
          <input className={input} placeholder="Job #" value={form.job} autoFocus onChange={(e) => setForm({ ...form, job: e.target.value })} />
          <input className={input} placeholder="Part #" value={form.part} onChange={(e) => setForm({ ...form, part: e.target.value })} />
          <input className={input + " col-span-2"} placeholder="Description" value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} />
          <input className={input} placeholder="Qty" inputMode="numeric" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
          <input className={input} type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
          <input
            className={input + " col-span-5"}
            placeholder="Operations in order, separated by commas (e.g. Laser L5, Press Brake, EOSS Assy)"
            value={form.ops}
            onChange={(e) => setForm({ ...form, ops: e.target.value })}
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white px-3 py-1 text-sm font-medium"
          >
            {busy ? "Saving…" : "Add job"}
          </button>
          {msg && <div className="col-span-6 text-xs text-red-600">{msg}</div>}
        </form>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1">
        {items.length === 0 ? (
          <div className="h-full flex items-center justify-center text-stone-400">
            {error || data?.error ? "Couldn't load the Job Ops tab" : data ? "No jobs released yet. Click + Add job." : "Loading…"}
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.fam} className="mb-2">
              <div className="sticky top-0 z-10 bg-stone-100 rounded-md px-2 py-1 flex items-baseline gap-2 text-sm">
                <span className="font-bold text-stone-900 tabular-nums">{g.fam}</span>
                <span className="text-stone-700 truncate">
                  {g.top.part} · {g.top.desc}
                </span>
                <span className="ml-auto text-xs text-stone-500 tabular-nums whitespace-nowrap">
                  {g.done}/{g.total} ops
                </span>
                <span className="w-20 h-1.5 rounded-full bg-stone-300 overflow-hidden shrink-0 self-center">
                  <span
                    className="block h-full bg-emerald-600"
                    style={{ width: `${g.total ? (g.done / g.total) * 100 : 0}%` }}
                  />
                </span>
              </div>

              {g.jobs.map((j) => {
                const complete = isComplete(j);
                const late = !complete && j.due && j.due < today;
                return (
                  <div
                    key={j.job}
                    className={
                      "flex items-start gap-3 px-2 py-1.5 border-b border-stone-100 " + (complete ? "bg-emerald-50" : "")
                    }
                  >
                    <div className="w-[34%] shrink-0 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span
                          className={
                            "font-semibold tabular-nums text-sm " + (complete ? "text-stone-400 line-through" : "text-stone-900")
                          }
                        >
                          {j.job}
                        </span>
                        <span className={"text-sm truncate " + (complete ? "text-stone-400 line-through" : "text-stone-700")}>
                          {j.part}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2 text-xs text-stone-500 min-w-0">
                        <span className="truncate">{j.desc}</span>
                        <span className="tabular-nums whitespace-nowrap">qty {j.qty}</span>
                        {j.due && (
                          <span className={"tabular-nums whitespace-nowrap " + (late ? "text-red-600 font-semibold" : "")}>
                            due {fmtDate(j.due)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex-1 flex flex-wrap gap-1.5">
                      {j.ops.map((o) => (
                        <button
                          key={o.op}
                          onClick={() => toggle(j, o.op)}
                          aria-pressed={o.done}
                          title={`Op ${o.op} · WC ${o.wc} · ${o.comp} complete / ${o.rem} remaining in M2M`}
                          className={
                            "inline-flex items-center gap-1.5 rounded-md pl-1 pr-2 py-1 text-xs font-medium border transition-colors " +
                            (o.done
                              ? "bg-emerald-600 border-emerald-600 text-white"
                              : "bg-white border-stone-300 text-stone-700 hover:border-stone-500")
                          }
                        >
                          <Check on={o.done} />
                          <span className="tabular-nums opacity-70">{o.op}</span>
                          <span className="whitespace-nowrap">{o.wcDesc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
