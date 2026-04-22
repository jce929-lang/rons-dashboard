"use client";

import useSWR from "swr";
import { useState } from "react";
import type { ViabilityRow } from "@/lib/types";
import { cn, fmtInt } from "@/lib/utils";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

function scoreColor(score: number, max: number) {
  if (max <= 0) return "bg-stone-100";
  const pct = score / max;
  if (pct >= 0.8) return "bg-emerald-100 text-emerald-900 border-emerald-300";
  if (pct >= 0.5) return "bg-lime-100 text-lime-900 border-lime-300";
  if (pct >= 0.25) return "bg-amber-100 text-amber-900 border-amber-300";
  return "bg-stone-100 text-stone-700 border-stone-300";
}

type DraftRow = { potential: number; channels: number; remaining_work: number };

export function ViabilityGrid({ editing }: { editing: boolean }) {
  const { data, mutate } = useSWR<{ items: ViabilityRow[] }>("/api/viability", fetcher);
  const [drafts, setDrafts] = useState<Record<number, DraftRow>>({});
  const [newProduct, setNewProduct] = useState({ product: "", potential: 0, channels: 0, remaining_work: 0 });

  const items = (data?.items ?? []).slice().sort((a, b) => b.score - a.score);
  const maxScore = Math.max(1, ...items.map((i) => i.score));

  async function saveRow(origIndex: number, row: ViabilityRow) {
    const d = drafts[origIndex];
    if (!d) return;
    await fetch("/api/viability", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index: origIndex, product: row.product, ...d }),
    });
    setDrafts((x) => {
      const next = { ...x };
      delete next[origIndex];
      return next;
    });
    mutate();
  }

  async function addProduct() {
    if (!newProduct.product.trim()) return;
    await fetch("/api/viability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newProduct),
    });
    setNewProduct({ product: "", potential: 0, channels: 0, remaining_work: 0 });
    mutate();
  }

  // Map back to original order index in the sheet (pre-sort order)
  const orig = data?.items ?? [];
  const indexOf = (row: ViabilityRow) => orig.indexOf(row);

  return (
    <div className="rounded-2xl bg-white border border-stone-200 p-4 shadow-sm h-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-stone-800">Product viability</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-stone-500 border-b border-stone-200">
              <th className="py-1.5 pr-2 font-medium">Product</th>
              <th className="py-1.5 px-1 font-medium text-center w-10">Pot.</th>
              <th className="py-1.5 px-1 font-medium text-center w-10">Chan.</th>
              <th className="py-1.5 px-1 font-medium text-center w-10">Work</th>
              <th className="py-1.5 pl-1 font-medium text-center w-14">Score</th>
              {editing && <th className="py-2 pl-2 font-medium text-center w-16"></th>}
            </tr>
          </thead>
          <tbody>
            {items.map((row) => {
              const origIdx = indexOf(row);
              const draft = drafts[origIdx];
              const liveScore = draft
                ? draft.potential * draft.channels * draft.remaining_work
                : row.score;
              return (
                <tr key={row.product} className="border-b border-stone-100 last:border-0">
                  <td className="py-2 pr-3 font-medium text-stone-800">{row.product}</td>
                  {(["potential", "channels", "remaining_work"] as const).map((k) => (
                    <td key={k} className="py-2 px-2 text-center">
                      {editing ? (
                        <input
                          type="number"
                          min={0}
                          max={10}
                          className="w-14 rounded border border-stone-300 px-1 py-0.5 text-center"
                          value={draft?.[k] ?? row[k]}
                          onChange={(e) =>
                            setDrafts((x) => ({
                              ...x,
                              [origIdx]: {
                                potential: x[origIdx]?.potential ?? row.potential,
                                channels: x[origIdx]?.channels ?? row.channels,
                                remaining_work: x[origIdx]?.remaining_work ?? row.remaining_work,
                                [k]: Number(e.target.value),
                              },
                            }))
                          }
                        />
                      ) : (
                        <span className="tabular-nums">{row[k]}</span>
                      )}
                    </td>
                  ))}
                  <td className="py-2 pl-2 text-center">
                    <span
                      className={cn(
                        "inline-block rounded-md border px-2 py-0.5 tabular-nums font-medium",
                        scoreColor(liveScore, maxScore)
                      )}
                    >
                      {fmtInt(liveScore)}
                    </span>
                  </td>
                  {editing && (
                    <td className="py-2 pl-2 text-center">
                      {draft && (
                        <button
                          onClick={() => saveRow(origIdx, row)}
                          className="text-xs bg-stone-800 text-white rounded px-2 py-1"
                        >
                          Save
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="mt-4 pt-4 border-t border-stone-200">
          <div className="text-sm font-medium text-stone-700 mb-2">Add product</div>
          <div className="flex flex-wrap gap-2 items-center">
            <input
              className="rounded-md border border-stone-300 px-3 py-1.5 text-sm flex-1 min-w-[200px]"
              placeholder="Product name"
              value={newProduct.product}
              onChange={(e) => setNewProduct({ ...newProduct, product: e.target.value })}
            />
            {(["potential", "channels", "remaining_work"] as const).map((k) => (
              <input
                key={k}
                type="number"
                min={0}
                max={10}
                placeholder={k[0].toUpperCase() + k.slice(1, 4)}
                className="w-20 rounded-md border border-stone-300 px-2 py-1.5 text-sm"
                value={newProduct[k] || ""}
                onChange={(e) => setNewProduct({ ...newProduct, [k]: Number(e.target.value) })}
              />
            ))}
            <button
              onClick={addProduct}
              className="rounded-md bg-stone-800 hover:bg-stone-900 text-white px-4 py-1.5 text-sm font-medium"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
