"use client";

import useSWR from "swr";
import { useState } from "react";
import type { SalesRow } from "@/lib/types";
import { SALES_CHANNELS } from "@/lib/types";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

function nextMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const offset = (8 - day) % 7 || 7;
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

export function SalesEditor() {
  const { data, mutate } = useSWR<{ items: SalesRow[] }>("/api/sales", fetcher);
  const [week, setWeek] = useState(nextMonday());
  const [type, setType] = useState<"Actual" | "Forecast">("Actual");
  const [vals, setVals] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  async function add() {
    setSaving(true);
    const payload: Record<string, unknown> = { week_of: week, type };
    for (const c of SALES_CHANNELS) payload[c] = vals[c] || 0;
    await fetch("/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setVals({});
    setSaving(false);
    mutate();
  }

  const groups: [string, readonly string[]][] = [
    ["Ford USL", ["ford_usl_fbm", "ford_usl_fba", "ford_usl_web"]],
    ["GM USL", ["gm_usl_fbm", "gm_usl_fba", "gm_usl_web"]],
    ["Ford FOL", ["ford_fol_fbm", "ford_fol_fba", "ford_fol_web"]],
    ["GM FOL", ["gm_fol_fbm", "gm_fol_fba", "gm_fol_web"]],
    ["Ram", ["ram_fbm", "ram_fba", "ram_web"]],
  ];

  const latest = (data?.items ?? []).slice(-5).reverse();

  return (
    <div className="rounded-2xl bg-white border border-stone-200 p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-stone-800 mb-4">Add weekly sales</h2>
      <div className="flex flex-wrap gap-3 mb-4">
        <label className="text-sm">
          <div className="text-stone-600 mb-1">Week of</div>
          <input
            type="date"
            value={week}
            onChange={(e) => setWeek(e.target.value)}
            className="rounded-md border border-stone-300 px-3 py-1.5"
          />
        </label>
        <label className="text-sm">
          <div className="text-stone-600 mb-1">Type</div>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "Actual" | "Forecast")}
            className="rounded-md border border-stone-300 px-3 py-1.5"
          >
            <option>Actual</option>
            <option>Forecast</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {groups.map(([name, keys]) => (
          <div key={name} className="rounded-lg border border-stone-200 p-3">
            <div className="text-sm font-medium text-stone-800 mb-2">{name}</div>
            <div className="space-y-1.5">
              {keys.map((k) => (
                <div key={k} className="flex items-center justify-between gap-2">
                  <label className="text-xs text-stone-600 uppercase">{k.split("_").pop()}</label>
                  <input
                    type="number"
                    min={0}
                    value={vals[k] ?? ""}
                    onChange={(e) => setVals((v) => ({ ...v, [k]: Number(e.target.value) }))}
                    className="w-20 rounded border border-stone-300 px-2 py-1 text-sm text-right"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-xs text-stone-500">
          Latest rows: {latest.map((r) => r.week_of.slice(0, 10)).join(", ") || "none"}
        </div>
        <button
          onClick={add}
          disabled={saving}
          className="rounded-md bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium"
        >
          {saving ? "Saving…" : "Add week"}
        </button>
      </div>
    </div>
  );
}
