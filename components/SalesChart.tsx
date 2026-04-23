"use client";

import useSWR from "swr";
import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardConfig, SalesRow } from "@/lib/types";
import { SALES_CHANNELS } from "@/lib/types";
import { fmtInt, fmtMoney, num } from "@/lib/utils";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

const RAM_CHANNELS = ["ram_fbm", "ram_fba", "ram_web"] as const;

const GROUPS = {
  "Ford USL": ["ford_usl_fbm", "ford_usl_fba", "ford_usl_web"],
  "GM USL":   ["gm_usl_fbm",  "gm_usl_fba",  "gm_usl_web"],
  "Ford FOL": ["ford_fol_fbm","ford_fol_fba","ford_fol_web"],
  "GM FOL":   ["gm_fol_fbm",  "gm_fol_fba",  "gm_fol_web"],
} as const;

const GROUP_COLORS: Record<keyof typeof GROUPS, string> = {
  "Ford USL": "#ea580c",
  "GM USL":   "#f59e0b",
  "Ford FOL": "#0284c7",
  "GM FOL":   "#0ea5e9",
};

type Metric = "units" | "revenue";
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

function fmtWeek(iso: string) {
  const d = new Date(iso + "T12:00:00");
  if (isNaN(+d)) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function SalesChart() {
  const { data: salesData } = useSWR<{ items: SalesRow[] }>("/api/sales", fetcher);
  const { data: configData } = useSWR<{ config: DashboardConfig }>("/api/config", fetcher);
  const [metric, setMetric] = useState<Metric>("units");

  const cfg = configData?.config;
  const items = salesData?.items ?? [];

  const chartData = useMemo(() => {
    if (!cfg || items.length === 0) return [];

    const now = new Date();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const yearEnd   = new Date(now.getFullYear(), 11, 31);

    // Rows to render as bars: actuals + forecasts within current month
    const visibleRows = items.filter((r) => {
      if (r.type === "Actual") return true;
      const d = new Date(r.week_of + "T12:00:00");
      return r.type === "Forecast" && d <= endOfMonth;
    });

    const actualRows = items.filter((r) => r.type === "Actual");
    if (actualRows.length === 0) return [];

    const firstDate = new Date(actualRows[0].week_of + "T12:00:00");

    // Value for a single row (total across all groups)
    const rowValue = (r: SalesRow) =>
      Object.entries(GROUPS).reduce((sum, [name, keys]) => {
        const units = keys.reduce((s, k) => s + num(r[k as (typeof SALES_CHANNELS)[number]]), 0);
        const price = metric === "revenue"
          ? (name.includes("FOL") ? cfg.fol_unit_price : cfg.usl_unit_price)
          : 1;
        return sum + units * price;
      }, 0);

    // Linear regression on actuals
    const pts = actualRows.map((r) => ({
      x: Math.round((new Date(r.week_of + "T12:00:00").getTime() - firstDate.getTime()) / MS_PER_WEEK),
      y: rowValue(r),
    }));
    const n = pts.length;
    const sx  = pts.reduce((s, p) => s + p.x, 0);
    const sy  = pts.reduce((s, p) => s + p.y, 0);
    const sxy = pts.reduce((s, p) => s + p.x * p.y, 0);
    const sx2 = pts.reduce((s, p) => s + p.x * p.x, 0);
    const denom = n * sx2 - sx * sx;
    const slope     = denom !== 0 ? (n * sxy - sx * sy) / denom : 0;
    const intercept = (sy - slope * sx) / n;
    const trend = (x: number) => Math.max(0, Math.round(slope * x + intercept));

    // Bar entries (actual + current-month forecast weeks)
    const barEntries = visibleRows.map((r) => {
      const x = Math.round((new Date(r.week_of + "T12:00:00").getTime() - firstDate.getTime()) / MS_PER_WEEK);
      const entry: Record<string, string | number | null> = {
        week: fmtWeek(r.week_of),
        weekRaw: r.week_of,
        type: r.type,
        Trend: trend(x),
      };
      for (const [name, keys] of Object.entries(GROUPS)) {
        const units = keys.reduce((s, k) => s + num(r[k as (typeof SALES_CHANNELS)[number]]), 0);
        const price = metric === "revenue"
          ? (name.includes("FOL") ? cfg.fol_unit_price : cfg.usl_unit_price)
          : 1;
        entry[name] = units * price;
      }
      return entry;
    });

    // Synthetic trend-only entries from the week after last bar through Dec 31
    const lastBarDate = visibleRows.length > 0
      ? new Date(visibleRows[visibleRows.length - 1].week_of + "T12:00:00")
      : new Date(actualRows[actualRows.length - 1].week_of + "T12:00:00");

    const syntheticEntries: Record<string, string | number | null>[] = [];
    const cur = new Date(lastBarDate);
    cur.setDate(cur.getDate() + 7);
    while (cur <= yearEnd) {
      const x = Math.round((cur.getTime() - firstDate.getTime()) / MS_PER_WEEK);
      syntheticEntries.push({
        week:    fmtWeek(cur.toISOString().slice(0, 10)),
        weekRaw: cur.toISOString().slice(0, 10),
        type: "Trend",
        Trend: trend(x),
      });
      cur.setDate(cur.getDate() + 7);
    }

    return [...barEntries, ...syntheticEntries];
  }, [items, cfg, metric]);

  // Show ~10 x-axis labels regardless of how many weeks are in the data
  const tickInterval = Math.max(1, Math.floor((chartData.length - 1) / 10));

  const fmtVal = (v: number) => metric === "revenue" ? fmtMoney(v) : fmtInt(v);

  return (
    <div className="rounded-2xl bg-white border border-stone-200 p-6 shadow-sm h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold text-stone-800">Weekly sales</h2>
          <div className="text-xs text-stone-500">Bars = actual / this-month forecast · dashed line = full-year trend</div>
        </div>
        <div className="inline-flex rounded-md border border-stone-300 bg-stone-50 p-0.5 text-sm">
          {(["units", "revenue"] as Metric[]).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={
                "px-3 py-1 rounded " +
                (metric === m ? "bg-white shadow-sm text-stone-900" : "text-stone-600 hover:text-stone-800")
              }
            >
              {m === "units" ? "Units" : "Revenue"}
            </button>
          ))}
        </div>
      </div>

      <div className="h-full min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
            <XAxis dataKey="week" tick={{ fontSize: 11 }} interval={tickInterval} />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={fmtVal}
              width={metric === "revenue" ? 72 : 40}
            />
            <Tooltip
              formatter={(v, name) =>
                name === "Trend"
                  ? [fmtVal(v as number), "Trend projection"]
                  : [fmtVal(v as number), name]
              }
              labelClassName="font-medium"
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {Object.entries(GROUPS).map(([name]) => (
              <Bar
                key={name}
                dataKey={name}
                stackId="a"
                fill={GROUP_COLORS[name as keyof typeof GROUPS]}
              />
            ))}
            <Line
              dataKey="Trend"
              type="linear"
              stroke="#44403c"
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={false}
              activeDot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function useSalesTotals() {
  const { data: salesData } = useSWR<{ items: SalesRow[] }>("/api/sales", fetcher);
  const { data: configData } = useSWR<{ config: DashboardConfig }>("/api/config", fetcher);
  return useMemo(() => {
    const items = salesData?.items ?? [];
    const cfg = configData?.config;
    if (!cfg) return null;
    const actuals = items.filter((r) => r.type === "Actual");
    const sum = (rows: SalesRow[], keys: readonly string[]) =>
      rows.reduce((s, r) => s + keys.reduce((ss, k) => ss + num(r[k as (typeof SALES_CHANNELS)[number]]), 0), 0);
    const one = (key: string) => sum(actuals, [key]);
    const brand = (prefix: string) => ({
      fbm: one(`${prefix}_fbm`),
      fba: one(`${prefix}_fba`),
      web: one(`${prefix}_web`),
      total: one(`${prefix}_fbm`) + one(`${prefix}_fba`) + one(`${prefix}_web`),
    });
    const fordUsl = brand("ford_usl");
    const gmUsl   = brand("gm_usl");
    const fordFol = brand("ford_fol");
    const gmFol   = brand("gm_fol");
    const ramUnits  = sum(actuals, RAM_CHANNELS);
    const uslUnits  = fordUsl.total + gmUsl.total;
    const folUnits  = fordFol.total + gmFol.total;
    const totalUnits = uslUnits + folUnits;
    const revenue = uslUnits * cfg.usl_unit_price + folUnits * cfg.fol_unit_price + ramUnits * cfg.ram_unit_price;
    return { fordUsl, gmUsl, fordFol, gmFol, totalUnits, revenue };
  }, [salesData, configData]);
}
