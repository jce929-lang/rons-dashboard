"use client";

import useSWR from "swr";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardConfig, ProjectionMonth, SalesRow } from "@/lib/types";
import { fmtMoney } from "@/lib/utils";
import { groupRevenue } from "./SalesChart";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

const PLAN_COLOR = "#d6d3d1"; // stone-300: the target
const ACTUAL_COLOR = "#047857"; // emerald-700: what we did

const monthLabel = (ym: string, withYear = false) => {
  const d = new Date(ym + "-15T12:00:00");
  return d.toLocaleDateString("en-US", withYear ? { month: "short", year: "numeric" } : { month: "short" });
};
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const fmtK = (v: number) => (Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`);

function Tile({ label, actual, plan, note }: { label: string; actual: number; plan: number; note?: string }) {
  const p = pct(actual, plan);
  return (
    <div className="rounded-xl border border-stone-200 bg-white px-3 py-2 min-w-0">
      <div className="text-xs uppercase tracking-wider text-stone-500 truncate">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-semibold tabular-nums text-stone-900">{fmtMoney(actual)}</span>
        <span className="text-xs tabular-nums text-stone-500">of {fmtMoney(plan)}</span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-stone-200 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, p)}%`, background: ACTUAL_COLOR }} />
        </div>
        <span className="text-xs font-medium tabular-nums text-stone-700">{p}%</span>
      </div>
      {note && <div className="text-[11px] text-stone-500 truncate">{note}</div>}
    </div>
  );
}

export function RevenuePlan() {
  const { data: plan, error } = useSWR<{ items: ProjectionMonth[]; error?: string }>("/api/projections", fetcher);
  const { data: sales } = useSWR<{ items: SalesRow[] }>("/api/sales", fetcher);
  const { data: configData } = useSWR<{ config: DashboardConfig }>("/api/config", fetcher);
  const cfg = configData?.config;

  const view = useMemo(() => {
    const months = plan?.items ?? [];
    if (!cfg || months.length === 0) return null;

    // Actual revenue per month: each week counts in the month its week starts.
    const actualByMonth = new Map<string, number>();
    for (const r of sales?.items ?? []) {
      if (r.type !== "Actual") continue;
      const m = r.week_of.slice(0, 7);
      const rev = Object.values(groupRevenue(r, cfg)).reduce((a, b) => a + b, 0);
      actualByMonth.set(m, (actualByMonth.get(m) ?? 0) + rev);
    }

    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const rows = months.map((p) => ({
      ...p,
      label: monthLabel(p.month),
      longLabel: monthLabel(p.month, true),
      actual: p.month <= thisMonth ? actualByMonth.get(p.month) ?? 0 : null,
      partial: p.month === thisMonth,
    }));

    const cur = rows.find((r) => r.month === thisMonth);
    const full = rows.filter((r) => r.month < thisMonth);
    const year = thisMonth.slice(0, 4);
    const ytd = full.filter((r) => r.month.startsWith(year));
    const last3 = full.slice(-3);
    const yearRows = rows.filter((r) => r.month.startsWith(year));
    const sum = (xs: typeof rows, f: (r: (typeof rows)[number]) => number) => xs.reduce((s, r) => s + f(r), 0);

    return {
      rows,
      thisMonth,
      cur,
      ytd: { actual: sum(ytd, (r) => r.actual ?? 0), plan: sum(ytd, (r) => r.total), through: ytd.at(-1)?.longLabel },
      last3: { actual: sum(last3, (r) => r.actual ?? 0) / Math.max(1, last3.length), plan: sum(last3, (r) => r.total) / Math.max(1, last3.length), from: last3[0]?.label, to: last3.at(-1)?.label },
      yearPlan: { actual: sum(yearRows, (r) => r.actual ?? 0), plan: sum(yearRows, (r) => r.total), year },
    };
  }, [plan, sales, cfg]);

  return (
    <div className="rounded-2xl bg-white border border-stone-200 p-4 shadow-sm h-full min-h-0 flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h2 className="text-lg font-semibold text-stone-800">Revenue plan vs. actual</h2>
          <div className="text-xs text-stone-500">Monthly revenue · plan from the &ldquo;Projections&rdquo; tab, actual from weekly sales</div>
        </div>
      </div>

      {!view ? (
        <div className="flex-1 flex items-center justify-center text-stone-400">
          {error || plan?.error ? "Couldn't load the Projections tab" : "Loading…"}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2 mb-2">
            {view.cur && (
              <Tile label={`${view.cur.longLabel} so far`} actual={view.cur.actual ?? 0} plan={view.cur.total} note="month to date" />
            )}
            <Tile label={`${view.yearPlan.year} YTD`} actual={view.ytd.actual} plan={view.ytd.plan} note={view.ytd.through ? `through ${view.ytd.through}` : undefined} />
            <Tile label="Last 3 months avg" actual={view.last3.actual} plan={view.last3.plan} note={view.last3.from ? `${view.last3.from}–${view.last3.to}, per month` : undefined} />
            <Tile label={`${view.yearPlan.year} full-year plan`} actual={view.yearPlan.actual} plan={view.yearPlan.plan} note="actual so far vs. whole-year plan" />
          </div>

          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={view.rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }} barGap={2} barCategoryGap="18%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: "#78716c" }}
                  tickLine={false}
                  axisLine={{ stroke: "#d6d3d1" }}
                  interval={0}
                  tickFormatter={(m: string, i: number) =>
                    i === 0 || m.endsWith("-01") ? `${monthLabel(m)} '${m.slice(2, 4)}` : monthLabel(m)
                  }
                />
                <YAxis tick={{ fontSize: 11, fill: "#78716c" }} tickLine={false} axisLine={false} tickFormatter={fmtK} width={44} />
                <ReferenceLine x={view.thisMonth} stroke="#78716c" strokeDasharray="4 3" label={{ value: "Today", position: "top", fontSize: 10, fill: "#78716c" }} />
                <Tooltip
                  cursor={{ fill: "rgba(120,113,108,0.08)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const r = payload[0].payload as (typeof view.rows)[number];
                    return (
                      <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs shadow-md tabular-nums">
                        <div className="font-medium text-stone-800 mb-1">{r.longLabel}</div>
                        <div className="text-stone-700">
                          Plan {fmtMoney(r.total)}
                        </div>
                        <div className="pl-3 text-stone-500">
                          USL Web/Amazon {fmtMoney(r.uslWeb)} · USL Distributor {fmtMoney(r.uslDist)}
                          <br />
                          Closet Locker {fmtMoney(r.closet)} · Handgun Locker {fmtMoney(r.handgun)}
                        </div>
                        {r.actual != null && (
                          <div className="mt-1 font-medium text-stone-800">
                            Actual {fmtMoney(r.actual)} ({pct(r.actual, r.total)}% of plan){r.partial ? " · month to date" : ""}
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  height={20}
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(v) => <span style={{ color: "#57534e" }}>{v}</span>}
                />
                <Bar name="Plan" dataKey="total" fill={PLAN_COLOR} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                <Bar name="Actual" dataKey="actual" fill={ACTUAL_COLOR} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {view.rows.map((r) => (
                    <Cell key={r.month} fill={ACTUAL_COLOR} fillOpacity={r.partial ? 0.45 : 1} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
