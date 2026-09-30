"use client";

import useSWR from "swr";
import { useState } from "react";
import { JOB_STEPS, type JobRow, type JobStep } from "@/lib/types";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

const STEP_LABEL: Record<JobStep, string> = {
  op1: "Op 1",
  op2: "Op 2",
  op3: "Op 3",
  op4: "Op 4",
  paint: "Paint",
  assembly: "Assembly",
};

function fmtDate(v: string) {
  if (!v) return "";
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v + "T12:00:00" : v;
  const d = new Date(iso);
  if (isNaN(+d)) return v;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const doneCount = (j: JobRow) => JOB_STEPS.filter((s) => j[s]).length;

export function JobTracker() {
  const { data, error, mutate } = useSWR<{ items: JobRow[]; error?: string }>("/api/jobs", fetcher);
  const [adding, setAdding] = useState(false);
  const [job, setJob] = useState("");
  const [part, setPart] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const items = data?.items ?? [];
  // Open jobs first (in the order they were released), finished jobs at the bottom.
  const sorted = [...items].sort((a, b) => {
    const ad = doneCount(a) === JOB_STEPS.length ? 1 : 0;
    const bd = doneCount(b) === JOB_STEPS.length ? 1 : 0;
    return ad - bd;
  });
  const open = items.filter((j) => doneCount(j) < JOB_STEPS.length).length;
  const finished = items.length - open;

  async function toggle(j: JobRow, step: JobStep) {
    const done = !j[step];
    // Show the check right away, then save to the sheet.
    mutate(
      (cur) => cur && { ...cur, items: cur.items.map((x) => (x.job === j.job && x.part === j.part ? { ...x, [step]: done } : x)) },
      { revalidate: false }
    );
    await fetch("/api/jobs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job: j.job, part: j.part, step, done }),
    });
    mutate();
  }

  async function addJob() {
    if (!job.trim()) {
      setMsg("Enter a job number");
      return;
    }
    setBusy(true);
    setMsg("");
    const r = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job, part }),
    });
    const res = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setMsg(res.error || "Couldn't add job");
      return;
    }
    setJob("");
    setPart("");
    mutate();
  }

  async function clearFinished() {
    setBusy(true);
    await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "archiveCompleted" }),
    });
    setBusy(false);
    mutate();
  }

  return (
    <div className="rounded-2xl bg-white border border-stone-200 p-4 shadow-sm h-full min-h-0 flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h2 className="text-lg font-semibold text-stone-800">Shop job releases</h2>
          <div className="text-xs text-stone-500 tabular-nums">
            {open} open · {finished} finished
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
              (adding
                ? "bg-stone-800 text-white border-stone-800"
                : "bg-white text-stone-600 border-stone-300 hover:bg-stone-50")
            }
          >
            {adding ? "Done adding" : "+ Add job"}
          </button>
        </div>
      </div>

      {adding && (
        <form
          className="flex items-center gap-2 mb-2 flex-wrap"
          onSubmit={(e) => {
            e.preventDefault();
            addJob();
          }}
        >
          <input
            value={job}
            onChange={(e) => setJob(e.target.value)}
            placeholder="Job #"
            autoFocus
            className="w-32 rounded-md border border-stone-300 px-2 py-1 text-sm"
          />
          <input
            value={part}
            onChange={(e) => setPart(e.target.value)}
            placeholder="Part #"
            className="w-44 rounded-md border border-stone-300 px-2 py-1 text-sm"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white px-3 py-1 text-sm font-medium"
          >
            {busy ? "Saving…" : "Add"}
          </button>
          {msg && <span className="text-xs text-red-600">{msg}</span>}
        </form>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {items.length === 0 ? (
          <div className="h-full flex items-center justify-center text-stone-400">
            {error || data?.error ? "Couldn't load the Jobs tab" : data ? "No jobs released yet. Click + Add job." : "Loading…"}
          </div>
        ) : (
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="text-xs uppercase tracking-wider text-stone-500">
                <th className="text-left font-medium py-1.5 pr-2 border-b border-stone-200">Job #</th>
                <th className="text-left font-medium py-1.5 pr-2 border-b border-stone-200">Part #</th>
                <th className="text-left font-medium py-1.5 pr-2 border-b border-stone-200">Released</th>
                {JOB_STEPS.map((s) => (
                  <th key={s} className="font-medium py-1.5 px-1 border-b border-stone-200 text-center">
                    {STEP_LABEL[s]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((j) => {
                const n = doneCount(j);
                const complete = n === JOB_STEPS.length;
                return (
                  <tr key={j.job + "|" + j.part} className={complete ? "bg-emerald-50" : ""}>
                    <td
                      className={
                        "py-1.5 pr-2 border-b border-stone-100 font-semibold tabular-nums " +
                        (complete ? "text-stone-400 line-through" : "text-stone-900")
                      }
                    >
                      {j.job}
                    </td>
                    <td
                      className={
                        "py-1.5 pr-2 border-b border-stone-100 tabular-nums " +
                        (complete ? "text-stone-400 line-through" : "text-stone-700")
                      }
                    >
                      {j.part}
                    </td>
                    <td className="py-1.5 pr-2 border-b border-stone-100 text-stone-500 tabular-nums whitespace-nowrap">
                      {fmtDate(j.released)}
                    </td>
                    {JOB_STEPS.map((s) => (
                      <td key={s} className="py-1 px-1 border-b border-stone-100 text-center">
                        <button
                          onClick={() => toggle(j, s)}
                          aria-label={`${STEP_LABEL[s]} for job ${j.job}`}
                          aria-pressed={j[s]}
                          className={
                            "inline-flex items-center justify-center w-7 h-7 rounded-md border-2 transition-colors " +
                            (j[s]
                              ? "bg-emerald-600 border-emerald-600 text-white"
                              : "bg-white border-stone-300 hover:border-stone-500")
                          }
                        >
                          {j[s] && (
                            <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={3}>
                              <path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </button>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
