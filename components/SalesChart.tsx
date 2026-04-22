"use client";

import useSWR from "swr";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
  "GM USL": ["gm_usl_fbm", "gm_usl_fba", "gm_usl_web"],
  "Ford FOL": ["ford_fol_fbm", "ford_fol_fba", "ford_fol_web"],
  "GM FOL": ["gm_fol_fbm", "gm_fol_fba", "gm_fol_web"],
} as const;

const GROUP_COLORS: Record<keyof typeof GROUPS, string> = {
  "Ford USL": "#ea580c",
  "GM USL": "#f59e0b",
  "Ford FOL": "#0284c7",
  "GM FOL": "#0ea5e9",
};

type Metric = "units" | "revenue";

function fmtWeek(iso: string) {
  const d = new Date(iso);
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
    if (!cfg) return [];
    return items.filter((r) => r.type === "Actual").map((r) => {
      const row: Record<string, string | number> = {
        week: fmtWeek(r.week_of),
        weekRaw: r.week_of,
        type: r.type,
      };
      for (const [name, keys] of Object.entries(GROUPS)) {
        const units = keys.reduce((s, k) => s + num(r[k as (typeof SALES_CHANNELS)[number]]), 0);
        if (metric === "units") {
          row[name] = units;
        } else {
          const price = name.includes("FOL") ? cfg.fol_unit_price : cfg.usl_unit_price;
          row[name] = units * price;
        }
      }
      return row;
    });
  }, [items, cfg, metric]);

  return (
    <div className="rounded-2xl bg-white border border-stone-200 p-6 shadow-sm h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold text-stone-800">Weekly sales</h2>
          <div className="text-xs text-stone-500">Stacked by product line</div>
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
          <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
            <XAxis dataKey="week" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => (metric === "revenue" ? fmtMoney(v as number) : fmtInt(v as number))}
            />
            <Tooltip
              formatter={(v) => (metric === "revenue" ? fmtMoney(v as number) : fmtInt(v as number))}
              labelClassName="font-medium"
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {Object.entries(GROUPS).map(([name]) => (
              <Bar key={name} dataKey={name} stackId="a" fill={GROUP_COLORS[name as keyof typeof GROUPS]} />
            ))}
          </BarChart>
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
    const gmUsl = brand("gm_usl");
    const fordFol = brand("ford_fol");
    const gmFol = brand("gm_fol");
    const ramUnits = sum(actuals, RAM_CHANNELS);
    const uslUnits = fordUsl.total + gmUsl.total;
    const folUnits = fordFol.total + gmFol.total;
    const totalUnits = uslUnits + folUnits;
    const revenue = uslUnits * cfg.usl_unit_price + folUnits * cfg.fol_unit_price + ramUnits * cfg.ram_unit_price;
    return { fordUsl, gmUsl, fordFol, gmFol, totalUnits, revenue };
  }, [salesData, configData]);
}
