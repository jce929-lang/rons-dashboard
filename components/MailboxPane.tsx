"use client";

import useSWR from "swr";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Summary } from "@/app/api/jobber/summary/route";
import { fmtMoney } from "@/lib/utils";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

const PAID = "#047857"; // emerald-700
const OWED = "#d97706"; // amber-600

const monthLabel = (ym: string, i: number) => {
  const d = new Date(ym + "-15T12:00:00");
  const m = d.toLocaleDateString("en-US", { month: "short" });
  return i === 0 || ym.endsWith("-01") ? `${m} '${ym.slice(2, 4)}` : m;
};
const fmtK = (v: number) => (Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`);
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

function Tile({ label, value, sub, subTone }: { label: string; value: string; sub?: string; subTone?: "bad" | "good" | "muted" }) {
  const tone = subTone === "bad" ? "text-red-600 font-semibold" : subTone === "good" ? "text-emerald-700 font-semibold" : "text-stone-500";
  return (
    <div className="rounded-xl border border-stone-200 px-3 py-2 min-w-0">
      <div className="text-xs uppercase tracking-wider text-stone-500 truncate">{label}</div>
      <div className="text-xl font-semibold tabular-nums text-stone-900 leading-tight">{value}</div>
      {sub && <div className={"text-xs tabular-nums truncate " + tone}>{sub}</div>}
    </div>
  );
}

function Step({ label, count, value, note, alert }: { label: string; count: number; value?: number; note?: string; alert?: boolean }) {
  return (
    <div className="flex-1 min-w-0 rounded-lg bg-stone-50 border border-stone-200 px-2.5 py-1.5">
      <div className="text-[11px] uppercase tracking-wider text-stone-500 truncate">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-lg font-semibold tabular-nums text-stone-900">{count}</span>
        {value != null && <span className="text-xs tabular-nums text-stone-600 truncate">{fmtMoney(value)}</span>}
      </div>
      {note && <div className={"text-[11px] truncate tabular-nums " + (alert ? "text-red-600 font-semibold" : "text-stone-500")}>{note}</div>}
    </div>
  );
}

const Arrow = () => <span className="text-stone-300 self-center shrink-0">›</span>;

export function MailboxPane({ loc = "indy", reserveRight = 0 }: { loc?: "indy" | "cincinnati"; reserveRight?: number }) {
  const { data, error } = useSWR<Summary & { error?: string; notConnected?: boolean }>(`/api/jobber/summary?loc=${loc}`, fetcher, {
    refreshInterval: 10 * 60_000,
  });
  const place = loc === "cincinnati" ? "Cincinnati" : "Indianapolis";

  const ok = data && !data.error && data.months;
  const months = ok ? data.months : [];
  const cur = months.at(-1);
  const prev = months.at(-2);
  // Last 12 full months (the current month is still in progress), matching how sales history is reported.
  const full12 = months.slice(-13, -1);
  const last12 = full12.reduce((s, m) => s + m.invoiced, 0);
  const shortMonth = (ym?: string) => (ym ? new Date(ym + "-15T12:00:00").toLocaleDateString("en-US", { month: "short", year: "2-digit" }).replace(" ", " '") : "");
  const updated = ok ? new Date(data.updatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
  const loadingMonths = months.filter((m) => !m.complete).length;

  return (
    <div className="rounded-2xl bg-white border border-stone-200 p-4 shadow-sm h-full min-h-0 flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-2" style={{ paddingRight: reserveRight }}>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-stone-800 truncate">Mailbox &amp; Streetscapes · {place}</h2>
          <div className="text-xs text-stone-500 truncate">
            {ok ? `Live from Jobber · updated ${updated}` : "From Jobber"}
            {loadingMonths > 0 && <span className="text-amber-700"> · still loading {loadingMonths} older month{loadingMonths === 1 ? "" : "s"}</span>}
          </div>
        </div>
      </div>

      {!ok ? (
        <div className="flex-1 flex items-center justify-center text-stone-400 text-center px-6">
          {data?.notConnected
            ? `${place}'s Jobber account isn't connected yet. An admin on that Jobber account needs to open the connect link once.`
            : error || data?.error
            ? `Couldn't load Jobber data${data?.error ? `: ${data.error}` : ""}`
            : "Loading from Jobber…"}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2 mb-2">
            <Tile
              label="Invoiced this month"
              value={fmtMoney(cur?.invoiced ?? 0)}
              sub={prev ? `last month ${fmtMoney(prev.invoiced)}` : undefined}
            />
            <Tile
              label="Last 12 full months"
              value={fmtMoney(last12)}
              sub={`${shortMonth(full12[0]?.month)}–${shortMonth(full12.at(-1)?.month)} · ${fmtMoney(Math.round(last12 / 12))}/mo avg`}
            />
            <Tile
              label="Owed to us"
              value={fmtMoney(data.owed.total)}
              sub={data.owed.overdue > 0 ? `▼ ${fmtMoney(data.owed.overdue)} overdue (${data.owed.overdueCount})` : `${data.owed.count} unpaid invoices, none overdue`}
              subTone={data.owed.overdue > 0 ? "bad" : "muted"}
            />
            <Tile
              label={`Quote close rate · ${data.winRate.days} days`}
              value={data.winRate.quoted ? `${pct(data.winRate.won, data.winRate.quoted)}%` : "—"}
              sub={`${data.winRate.won} won of ${data.winRate.quoted} quotes`}
            />
          </div>

          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={months} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: "#78716c" }}
                  tickLine={false}
                  axisLine={{ stroke: "#d6d3d1" }}
                  interval={0}
                  tickFormatter={monthLabel}
                />
                <YAxis tick={{ fontSize: 11, fill: "#78716c" }} tickLine={false} axisLine={false} tickFormatter={fmtK} width={44} />
                <Tooltip
                  cursor={{ fill: "rgba(120,113,108,0.08)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const r = payload[0].payload as Summary["months"][number];
                    const d = new Date(r.month + "-15T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
                    return (
                      <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs shadow-md tabular-nums">
                        <div className="font-medium text-stone-800 mb-1">{d}</div>
                        <div className="text-stone-700">Invoiced {fmtMoney(r.invoiced)}</div>
                        <div className="flex items-center gap-1.5 text-stone-600">
                          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: PAID }} /> Paid {fmtMoney(r.paid)}
                        </div>
                        <div className="flex items-center gap-1.5 text-stone-600">
                          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: OWED }} /> Still owed {fmtMoney(r.owed)}
                        </div>
                      </div>
                    );
                  }}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  height={18}
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(v) => <span style={{ color: "#57534e" }}>{v}</span>}
                />
                <Bar name="Paid" dataKey="paid" stackId="m" fill={PAID} stroke="#fff" strokeWidth={1} isAnimationActive={false} />
                <Bar name="Still owed" dataKey="owed" stackId="m" fill={OWED} stroke="#fff" strokeWidth={1} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2">
            <div className="text-[11px] uppercase tracking-wider text-stone-500 mb-1">Pipeline right now</div>
            <div className="flex items-stretch gap-1.5">
              <Step
                label="Open requests"
                count={data.pipeline.requests}
                note={data.pipeline.changesRequested ? `${data.pipeline.changesRequested} quote changes requested` : undefined}
              />
              <Arrow />
              <Step
                label={`Quotes out · ${data.winRate.days} days`}
                count={data.pipeline.quotesOut.count}
                value={data.pipeline.quotesOut.value}
                note={`${data.pipeline.quotesOut.allTime.toLocaleString()} open all-time`}
              />
              <Arrow />
              <Step label="Approved quotes" count={data.pipeline.approved.count} value={data.pipeline.approved.value} />
              <Arrow />
              <Step
                label="Active jobs"
                count={data.pipeline.activeJobs}
                note={data.pipeline.lateJobs ? `${data.pipeline.lateJobs} late · ${data.pipeline.todayJobs} today` : `${data.pipeline.todayJobs} today`}
                alert={data.pipeline.lateJobs > 0}
              />
              <Arrow />
              <Step label="Needs invoicing" count={data.pipeline.toInvoice.count} value={data.pipeline.toInvoice.value} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
