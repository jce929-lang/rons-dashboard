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
// Fiscal year runs October–September and is named for the year it ends in (Oct 2026–Sep 2027 = FY27).
const FY_START_MONTH = 10;
function fiscalYear(ym: string) {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  const startYear = m >= FY_START_MONTH ? y : y - 1;
  const first = `${startYear}-${String(FY_START_MONTH).padStart(2, "0")}`;
  const lastMonth = ((FY_START_MONTH + 10) % 12) + 1; // month before the start month
  const last = `${lastMonth < FY_START_MONTH ? startYear + 1 : startYear}-${String(lastMonth).padStart(2, "0")}`;
  return { first, last, name: `FY${String(Number(last.slice(0, 4)) % 100).padStart(2, "0")}` };
}
const shortMonthYear = (ym: string) => `${monthLabel(ym)} '${ym.slice(2, 4)}`;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const fmtK = (v: number) => (Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`);

/**
 * One number that matters, against its plan.
 * The bar fills to actual / plan; the tick marks where the plan says we should be by now (if given).
 */
function Tile({
  label,
  actual,
  plan,
  target,
  targetLabel,
  note,
}: {
  label: string;
  actual: number;
  plan: number; // the full plan for the period (bar = 100%)
  target?: number; // what the plan expects by now (defaults to the full plan)
  targetLabel?: string;
  note?: string;
}) {
  const goal = target ?? plan;
  const diff = Math.round(actual - goal);
  const ahead = diff >= 0;
  const fill = plan > 0 ? Math.min(100, (actual / plan) * 100) : 0;
  const tick = target != null && plan > 0 ? Math.min(100, (target / plan) * 100) : null;
  return (
    <div className="rounded-xl border border-stone-200 bg-white px-3 py-2 min-w-0">
      <div className="text-xs uppercase tracking-wider text-stone-500 truncate">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums text-stone-900 leading-tight">{fmtMoney(actual)}</span>
        <span className="text-xs tabular-nums text-stone-500 truncate">of {fmtMoney(plan)} plan</span>
      </div>
      <div className="relative mt-1 h-2 rounded-full bg-stone-200">
        <div className="h-full rounded-full" style={{ width: `${fill}%`, background: ACTUAL_COLOR }} />
        {tick != null && (
          <div
            className="absolute -top-1 -bottom-1 w-0.5 bg-stone-800"
            style={{ left: `calc(${tick}% - 1px)` }}
            title={`${targetLabel ?? "Plan to date"}: ${fmtMoney(goal)}`}
          />
        )}
      </div>
      <div className={"mt-1 text-xs font-semibold tabular-nums " + (ahead ? "text-emerald-700" : "text-red-600")}>
        {ahead ? "▲" : "▼"} {fmtMoney(Math.abs(diff))} {ahead ? "ahead of" : "behind"} {targetLabel ?? "plan"}
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

    // Weekly data runs through the last reported week (week start + 6 days), not necessarily today.
    const lastWeek = (sales?.items ?? []).filter((r) => r.type === "Actual").reduce((m, r) => (r.week_of > m ? r.week_of : m), "");
    const now = new Date();
    const asOf = lastWeek ? new Date(lastWeek + "T12:00:00") : now;
    if (lastWeek) asOf.setDate(asOf.getDate() + 6);
    const thisMonth = `${asOf.getFullYear()}-${String(asOf.getMonth() + 1).padStart(2, "0")}`;
    const daysInMonth = new Date(asOf.getFullYear(), asOf.getMonth() + 1, 0).getDate();
    const monthFrac = Math.min(1, asOf.getDate() / daysInMonth);
    const asOfLabel = asOf.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    const rows = months.map((p) => ({
      ...p,
      label: monthLabel(p.month),
      longLabel: monthLabel(p.month, true),
      actual: p.month <= thisMonth ? actualByMonth.get(p.month) ?? 0 : null,
      partial: p.month === thisMonth,
    }));

    const cur = rows.find((r) => r.month === thisMonth);
    const prev = [...rows].reverse().find((r) => r.month < thisMonth);
    const fy = fiscalYear(thisMonth);
    const yearRows = rows.filter((r) => r.month >= fy.first && r.month <= fy.last);
    const planThrough = yearRows.at(-1)?.month ?? fy.first;
    const sum = (xs: typeof rows, f: (r: (typeof rows)[number]) => number) => xs.reduce((s, r) => s + f(r), 0);
    const yearPlan = sum(yearRows, (r) => r.total);
    const yearActual = sum(yearRows, (r) => r.actual ?? 0);
    const yearPlanToDate =
      sum(yearRows.filter((r) => r.month < thisMonth), (r) => r.total) + (cur ? cur.total * monthFrac : 0);

    return {
      rows,
      thisMonth,
      asOfLabel,
      cur: cur && { actual: cur.actual ?? 0, plan: cur.total, pace: cur.total * monthFrac, name: monthLabel(cur.month).toUpperCase() },
      prev: prev && { actual: prev.actual ?? 0, plan: prev.total, name: monthLabel(prev.month).toUpperCase() },
      year: {
        name: fy.name,
        span: `${shortMonthYear(fy.first)}–${shortMonthYear(fy.last)}`,
        planShort: yearRows.length < 12 ? shortMonthYear(planThrough) : null, // plan doesn't cover the whole year
        actual: yearActual,
        plan: yearPlan,
        toDate: yearPlanToDate,
      },
    };
  }, [plan, sales, cfg]);

  return (
    <div className="rounded-2xl bg-white border border-stone-200 p-4 shadow-sm h-full min-h-0 flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h2 className="text-lg font-semibold text-stone-800">Revenue plan vs. actual</h2>
          <div className="text-xs text-stone-500">Monthly revenue · plan from the &ldquo;Projections&rdquo; tab, actual from the weekly sales master</div>
        </div>
      </div>

      {!view ? (
        <div className="flex-1 flex items-center justify-center text-stone-400">
          {error || plan?.error ? "Couldn't load the Projections tab" : "Loading…"}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-2">
            {view.cur && (
              <Tile
                label={`${view.cur.name} so far`}
                actual={view.cur.actual}
                plan={view.cur.plan}
                target={view.cur.pace}
                targetLabel="plan pace"
                note={`sales through ${view.asOfLabel} · | = plan pace`}
              />
            )}
            {view.prev && (
              <Tile label={`${view.prev.name} (last month)`} actual={view.prev.actual} plan={view.prev.plan} />
            )}
            <Tile
              label={`${view.year.name} (${view.year.span}) vs. plan`}
              actual={view.year.actual}
              plan={view.year.plan}
              target={view.year.toDate}
              targetLabel="plan to date"
              note={
                view.year.planShort
                  ? `${pct(view.year.actual, view.year.plan)}% of plan · plan only runs through ${view.year.planShort}`
                  : `${pct(view.year.actual, view.year.plan)}% of the year plan · | = plan to date`
              }
            />
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
