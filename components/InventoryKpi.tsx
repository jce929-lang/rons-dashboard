"use client";

import useSWR from "swr";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { InventoryWeek } from "@/lib/types";
import { fmtMoney } from "@/lib/utils";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

const WIP_COLOR = "#ea580c"; // orange-600
const RM_COLOR = "#0284c7"; // sky-600

const RANGES = [
  { key: "8w", label: "8 wk", weeks: 8 },
  { key: "6m", label: "6 mo", weeks: 26 },
  { key: "1y", label: "1 yr", weeks: 52 },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

const DAY = 86400000;
const t = (iso: string) => new Date(iso + "T12:00:00").getTime();
const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;
const fmtShort = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

function Tile({
  label,
  value,
  sub,
  note,
  swatch,
}: {
  label: string;
  value: string;
  sub?: string;
  note?: string;
  swatch?: string;
}) {
  return (
    <div className="rounded-xl border border-stone-200 px-3 py-2 min-w-0">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-stone-500">
        {swatch && <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: swatch }} />}
        {label}
      </div>
      <div className="text-xl font-semibold tabular-nums text-stone-900">{value}</div>
      {sub && <div className="text-sm tabular-nums text-stone-700">{sub}</div>}
      {note && <div className="text-xs tabular-nums text-stone-500">{note}</div>}
    </div>
  );
}

export function InventoryKpi() {
  const { data, error, mutate } = useSWR<{ items: InventoryWeek[]; error?: string }>("/api/inventory", fetcher);
  const [range, setRange] = useState<RangeKey>("8w");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ date: "", wip: "", rm: "", oo: "" });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const items = data?.items ?? [];

  const view = useMemo(() => {
    if (items.length === 0) return null;
    const latest = items[items.length - 1];
    // 12-month averages over the year ending at the latest week (same as the spreadsheet)
    const yr = items.filter((r) => t(r.date) > t(latest.date) - 365 * DAY);
    const avg = (f: (r: InventoryWeek) => number) => yr.reduce((s, r) => s + f(r), 0) / yr.length;
    const weeks = RANGES.find((r) => r.key === range)!.weeks;
    const rows = items.slice(-weeks).map((r) => ({
      date: r.date,
      label: fmtShort(r.date),
      wipPct: r.wip / r.oo,
      rmPct: r.rm / r.oo,
      wip: r.wip,
      rm: r.rm,
      oo: r.oo,
    }));
    const avgWipPct = avg((r) => r.wip / r.oo);
    const avgRmPct = avg((r) => r.rm / r.oo);
    // Y axis: 0 to the next 5% above the highest value, ticks every 5% (10% if the range is large)
    const maxVal = Math.max(avgWipPct, avgRmPct, ...rows.flatMap((r) => [r.wipPct, r.rmPct]));
    const step = maxVal > 0.5 ? 0.1 : 0.05;
    const top = Math.ceil((maxVal + 0.01) / step) * step;
    const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => +(i * step).toFixed(2));
    return {
      latest,
      rows,
      top,
      ticks,
      avgWipPct,
      avgRmPct,
      avgWip: avg((r) => r.wip),
      avgRm: avg((r) => r.rm),
      avgOo: avg((r) => r.oo),
    };
  }, [items, range]);

  async function addWeek() {
    setBusy(true);
    setMsg("");
    const r = await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const res = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg(res.error || "Couldn't save week");
    setForm({ date: "", wip: "", rm: "", oo: "" });
    setAdding(false);
    mutate();
  }

  const input = "rounded-md border border-stone-300 px-2 py-1 text-sm";

  return (
    <div className="rounded-2xl bg-white border border-stone-200 p-4 shadow-sm h-full min-h-0 flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h2 className="text-lg font-semibold text-stone-800">Shop KPIs: WIP &amp; raw materials vs. open orders</h2>
          <div className="text-xs text-stone-500">
            {view ? `Week of ${fmtShort(view.latest.date)} · dashed lines = 12-month average` : "Weekly, from M2M"}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="inline-flex rounded-md border border-stone-300 bg-stone-50 p-0.5 text-xs">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={
                  "px-2.5 py-1 rounded " +
                  (range === r.key ? "bg-white shadow-sm text-stone-900" : "text-stone-600 hover:text-stone-800")
                }
              >
                {r.label}
              </button>
            ))}
          </div>
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
            {adding ? "Cancel" : "+ Add week"}
          </button>
        </div>
      </div>

      {adding && (
        <form
          className="flex flex-wrap items-center gap-2 mb-2 p-2 rounded-lg bg-stone-50 border border-stone-200"
          onSubmit={(e) => {
            e.preventDefault();
            addWeek();
          }}
        >
          <input className={input} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <input className={input + " w-32"} placeholder="WIP $" inputMode="decimal" value={form.wip} onChange={(e) => setForm({ ...form, wip: e.target.value })} />
          <input className={input + " w-36"} placeholder="Raw materials $" inputMode="decimal" value={form.rm} onChange={(e) => setForm({ ...form, rm: e.target.value })} />
          <input className={input + " w-36"} placeholder="Open orders $" inputMode="decimal" value={form.oo} onChange={(e) => setForm({ ...form, oo: e.target.value })} />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white px-3 py-1 text-sm font-medium"
          >
            {busy ? "Saving…" : "Save week"}
          </button>
          {msg && <span className="text-xs text-red-600">{msg}</span>}
        </form>
      )}

      {!view ? (
        <div className="flex-1 flex items-center justify-center text-stone-400">
          {error || data?.error ? "Couldn't load the Inventory tab" : data ? "No weeks entered yet. Click + Add week." : "Loading…"}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2 mb-2">
            <Tile
              label="WIP"
              swatch={WIP_COLOR}
              value={pct(view.latest.wip / view.latest.oo)}
              sub={fmtMoney(view.latest.wip)}
              note={`12-mo avg ${pct(view.avgWipPct)}`}
            />
            <Tile
              label="Raw materials"
              swatch={RM_COLOR}
              value={pct(view.latest.rm / view.latest.oo)}
              sub={fmtMoney(view.latest.rm)}
              note={`12-mo avg ${pct(view.avgRmPct)}`}
            />
            <Tile
              label="Total inventory"
              value={pct((view.latest.wip + view.latest.rm) / view.latest.oo)}
              sub={fmtMoney(view.latest.wip + view.latest.rm)}
              note={`12-mo avg ${pct(view.avgWipPct + view.avgRmPct)}`}
            />
            <Tile
              label="Open orders"
              value={fmtMoney(view.latest.oo)}
              note={`12-mo avg ${fmtMoney(view.avgOo)}`}
            />
          </div>

          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={view.rows} margin={{ top: 8, right: 28, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#78716c" }}
                  tickLine={false}
                  axisLine={{ stroke: "#d6d3d1" }}
                  interval={view.rows.length > 12 ? Math.floor(view.rows.length / 8) : 0}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#78716c" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => pct(v, 0)}
                  width={40}
                  domain={[0, view.top]}
                  ticks={view.ticks}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const r = payload[0].payload as (typeof view.rows)[number];
                    return (
                      <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs shadow-md tabular-nums">
                        <div className="font-medium text-stone-800 mb-1">Week of {fmtShort(r.date)}</div>
                        <div className="flex items-center gap-1.5 text-stone-700">
                          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: WIP_COLOR }} />
                          WIP {pct(r.wipPct)} · {fmtMoney(r.wip)}
                        </div>
                        <div className="flex items-center gap-1.5 text-stone-700">
                          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: RM_COLOR }} />
                          Raw materials {pct(r.rmPct)} · {fmtMoney(r.rm)}
                        </div>
                        <div className="text-stone-500 mt-0.5">Open orders {fmtMoney(r.oo)}</div>
                      </div>
                    );
                  }}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  height={20}
                  iconType="plainline"
                  wrapperStyle={{ fontSize: 12, color: "#57534e" }}
                />
                <ReferenceLine y={view.avgWipPct} stroke={WIP_COLOR} strokeDasharray="6 4" strokeOpacity={0.6} />
                <ReferenceLine y={view.avgRmPct} stroke={RM_COLOR} strokeDasharray="6 4" strokeOpacity={0.6} />
                <Line
                  name="WIP % of open orders"
                  dataKey="wipPct"
                  stroke={WIP_COLOR}
                  strokeWidth={2.5}
                  dot={view.rows.length <= 12 ? { r: 4, strokeWidth: 2, fill: "#fff" } : false}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
                <Line
                  name="Raw materials % of open orders"
                  dataKey="rmPct"
                  stroke={RM_COLOR}
                  strokeWidth={2.5}
                  dot={view.rows.length <= 12 ? { r: 4, strokeWidth: 2, fill: "#fff" } : false}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
