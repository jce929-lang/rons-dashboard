import { NextResponse } from "next/server";
import { JobberNotConnected, jobberQuery } from "@/lib/jobber";
import { ensureSheet, readRange, writeRange } from "@/lib/sheets";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Mailbox & Streetscapes summary from Jobber. Totals only: no client names or addresses leave the server.
// Cached per server instance for 10 minutes so the TV doesn't hammer Jobber's API.
const CACHE_MS = 10 * 60_000;
let cache: { at: number; data: Summary } | null = null;

type Page<T> = { nodes: T[]; pageInfo: { hasNextPage: boolean; endCursor: string | null }; totalCount?: number };

export type Summary = {
  updatedAt: string;
  months: { month: string; invoiced: number; paid: number; owed: number; invoices: number; complete: boolean }[];
  owed: { total: number; overdue: number; count: number; overdueCount: number };
  pipeline: {
    requests: number;
    quotesOut: { count: number; value: number; allTime: number };
    changesRequested: number;
    approved: { count: number; value: number };
    activeJobs: number;
    todayJobs: number;
    lateJobs: number;
    toInvoice: { count: number; value: number };
  };
  winRate: { won: number; quoted: number; days: number };
  // Counts by Jobber status, for checking what the pipeline numbers are made of.
  detail: { jobs: Record<string, number>; requests: Record<string, number>; quotes: Record<string, number>; monthsRefreshed: string[] };
};

const iso = (d: Date) => d.toISOString();
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Run calls one after another (gentler on Jobber's rate limit than firing them all at once). */
async function seq<A, R>(xs: A[], f: (x: A) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (const x of xs) out.push(await f(x));
  return out;
}

/** Walk every page of a connection, capped so one call can't run away. Also returns Jobber's own total count. */
async function allWithCount<T>(field: string, filter: Record<string, unknown>, nodeFields: string, maxPages = 30, pageSize = 50) {
  const q = `query ($filter: ${filterType(field)}, $after: String) {
    ${field}(filter: $filter, first: ${pageSize}, after: $after) { totalCount nodes { ${nodeFields} } pageInfo { hasNextPage endCursor } }
  }`;
  const out: T[] = [];
  let total = 0;
  let after: string | null = null;
  for (let i = 0; i < maxPages; i++) {
    const data: Record<string, Page<T>> = await jobberQuery(q, { filter, after });
    const page: Page<T> = data[field];
    total = n(page.totalCount);
    out.push(...page.nodes);
    if (!page.pageInfo.hasNextPage) break;
    after = page.pageInfo.endCursor;
    await sleep(100); // stay well under Jobber's rate limit
  }
  return { nodes: out, total };
}
async function all<T>(field: string, filter: Record<string, unknown>, nodeFields: string, maxPages = 30): Promise<T[]> {
  return (await allWithCount<T>(field, filter, nodeFields, maxPages)).nodes;
}

// ---------- monthly invoice totals, saved in the "Jobber Monthly" sheet tab ----------
// Pulling a year of invoices takes too long for one request, so each month is pulled on its own and saved.
// The current and previous month refresh every time; older months refresh once a day (payments still land on them).
const MONTH_TAB = "Jobber Monthly";
const MONTH_HEADER = ["Month", "Invoiced", "Paid", "Still owed", "Invoices", "Jobber count", "Refreshed"];
type MonthRow = { month: string; invoiced: number; paid: number; owed: number; invoices: number; expected: number; refreshed: string };

async function readMonths(): Promise<Map<string, MonthRow>> {
  await ensureSheet(MONTH_TAB, [MONTH_HEADER]);
  const rows = await readRange(`${MONTH_TAB}!A2:G`);
  const num = (v: string | undefined) => Number(String(v ?? "").replace(/[$,]/g, "")) || 0;
  return new Map(
    rows
      .filter((r) => /^\d{4}-\d{2}$/.test((r[0] ?? "").replace(/^'/, "")))
      .map((r) => {
        const month = r[0].replace(/^'/, "");
        return [month, { month, invoiced: num(r[1]), paid: num(r[2]), owed: num(r[3]), invoices: num(r[4]), expected: num(r[5]), refreshed: r[6] ?? "" }];
      })
  );
}

async function writeMonths(m: Map<string, MonthRow>) {
  const rows = [...m.values()].sort((a, b) => a.month.localeCompare(b.month));
  await writeRange(`${MONTH_TAB}!A1:G${rows.length + 1}`, [
    MONTH_HEADER,
    ...rows.map((r) => [`'${r.month}`, Math.round(r.invoiced * 100) / 100, Math.round(r.paid * 100) / 100, Math.round(r.owed * 100) / 100, r.invoices, r.expected, r.refreshed]),
  ]);
}

async function pullMonth(month: string): Promise<MonthRow> {
  type Inv = { issuedDate: string | null; invoiceStatus: string; amounts: { total: number; invoiceBalance: number } };
  const [y, mo] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, mo - 1, 1));
  const end = new Date(Date.UTC(y, mo, 1));
  const filter = { issuedDate: { after: new Date(start.getTime() - 1).toISOString(), before: end.toISOString() } };
  const fields = "issuedDate invoiceStatus amounts { total invoiceBalance }";
  let res: { nodes: Inv[]; total: number };
  try {
    res = await allWithCount<Inv>("invoices", filter, fields, 80, 100);
  } catch {
    res = await allWithCount<Inv>("invoices", filter, fields, 160, 50); // page size Jobber always accepts
  }
  const { nodes, total } = res;
  const row: MonthRow = { month, invoiced: 0, paid: 0, owed: 0, invoices: 0, expected: total, refreshed: new Date().toISOString() };
  for (const inv of nodes) {
    if (inv.invoiceStatus === "draft") continue;
    const t = n(inv.amounts?.total);
    const bal = inv.invoiceStatus === "bad_debt" ? 0 : n(inv.amounts?.invoiceBalance);
    row.invoiced += t;
    row.owed += bal;
    row.paid += Math.max(0, t - bal);
    row.invoices++;
  }
  row.expected = Math.max(total, nodes.length);
  if (nodes.length < total) row.refreshed = ""; // didn't get everything: try again next time
  return row;
}

/** Just the count for a filter. */
async function count(field: string, filter: Record<string, unknown>): Promise<number> {
  const q = `query ($filter: ${filterType(field)}) { ${field}(filter: $filter, first: 1) { totalCount } }`;
  const data: Record<string, { totalCount: number }> = await jobberQuery(q, { filter });
  return n(data[field].totalCount);
}

function filterType(field: string) {
  return { invoices: "InvoiceFilterAttributes", quotes: "QuoteFilterAttributes", jobs: "JobFilterAttributes", requests: "RequestFilterAttributes" }[field]!;
}

async function build(): Promise<Summary> {
  const now = new Date();
  const firstMonth = new Date(now.getFullYear(), now.getMonth() - 12, 1); // this month + the 12 before it
  const winDays = 90;
  const winFrom = new Date(now.getTime() - winDays * 86400_000);

  type Owed = { invoiceStatus: string; amounts: { invoiceBalance: number } };
  type Qt = { quoteStatus: string; amounts: { total: number } };
  type Jb = { uninvoicedTotal: number };

  // Invoices by issue month for this month + the 12 before it, from the saved monthly totals.
  const started = Date.now();
  const saved = await readMonths();
  const monthKeys: string[] = [];
  for (let d = new Date(firstMonth); d <= now; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const refreshed: string[] = [];
  for (const [i, month] of monthKeys.entries()) {
    const recentMonth = i >= monthKeys.length - 2;
    const prev = saved.get(month);
    const stale = !prev || !prev.refreshed || Date.now() - Date.parse(prev.refreshed) > 24 * 3600_000;
    if (!recentMonth && !stale) continue;
    if (!recentMonth && Date.now() - started > 35_000) continue; // out of time this run; the next refresh picks it up
    saved.set(month, await pullMonth(month));
    refreshed.push(month);
  }
  if (refreshed.length) await writeMonths(saved);
  const byMonth = new Map(
    monthKeys.map((m) => {
      const r = saved.get(m);
      return [m, { invoiced: r?.invoiced ?? 0, paid: r?.paid ?? 0, owed: r?.owed ?? 0, invoices: r?.invoices ?? 0, complete: !!r?.refreshed }];
    })
  );

  // Everything still owed, any age.
  const owedLists = await seq(["awaiting_payment", "sent_not_due", "past_due"], (status) =>
    all<Owed>("invoices", { status }, "invoiceStatus amounts { invoiceBalance }")
  );
  const owedAll = owedLists.flat().filter((i) => n(i.amounts?.invoiceBalance) > 0);
  const overdue = owedAll.filter((i) => i.invoiceStatus === "past_due");

  // Pipeline.
  const quotesOut = { length: await count("quotes", { status: "awaiting_response" }) };
  const approved = await all<Qt>("quotes", { status: "approved" }, "quoteStatus amounts { total }");
  const changesRequested = await count("quotes", { status: "changes_requested" });
  const REQ = ["new", "assessment_completed", "upcoming", "today", "overdue", "unscheduled"];
  const JOB = ["active", "upcoming", "today", "unscheduled", "action_required", "on_hold"];
  const QUO = ["draft", "awaiting_response", "changes_requested", "approved", "converted", "archived"];
  const requestCounts = await seq(REQ, (status) => count("requests", { status }));
  const activeCounts = await seq(JOB, (status) => count("jobs", { status }));
  const quoteCounts = await seq(QUO, (status) => count("quotes", { status }));
  const lateJobs = await count("jobs", { status: "late" });
  const toInvoice = await all<Jb>("jobs", { status: "requires_invoicing" }, "uninvoicedTotal");

  // Last 90 days of quotes (drafts excluded). Lost quotes are rarely archived in this account, so
  // "close rate" = won / all quotes created, and "quotes out" only counts recent ones still waiting.
  const recent = (await all<Qt>("quotes", { createdAt: { after: iso(winFrom) } }, "quoteStatus amounts { total }")).filter(
    (q) => q.quoteStatus !== "draft"
  );
  const won = recent.filter((q) => q.quoteStatus === "approved" || q.quoteStatus === "converted").length;
  const recentOut = recent.filter((q) => q.quoteStatus === "awaiting_response");

  const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
  return {
    updatedAt: now.toISOString(),
    months: [...byMonth.entries()].map(([month, v]) => ({ month, ...v })),
    owed: {
      total: sum(owedAll, (i) => n(i.amounts.invoiceBalance)),
      overdue: sum(overdue, (i) => n(i.amounts.invoiceBalance)),
      count: owedAll.length,
      overdueCount: overdue.length,
    },
    pipeline: {
      requests: requestCounts.reduce((a, b) => a + b, 0),
      quotesOut: { count: recentOut.length, value: sum(recentOut, (q) => n(q.amounts?.total)), allTime: quotesOut.length },
      changesRequested,
      approved: { count: approved.length, value: sum(approved, (q) => n(q.amounts?.total)) },
      activeJobs: activeCounts.reduce((a, b) => a + b, 0) + lateJobs,
      todayJobs: activeCounts[JOB.indexOf("today")],
      lateJobs,
      toInvoice: { count: toInvoice.length, value: sum(toInvoice, (j) => n(j.uninvoicedTotal)) },
    },
    winRate: { won, quoted: recent.length, days: winDays },
    detail: {
      jobs: Object.fromEntries([...JOB.map((k, i) => [k, activeCounts[i]]), ["late", lateJobs], ["requires_invoicing", toInvoice.length]]),
      requests: Object.fromEntries(REQ.map((k, i) => [k, requestCounts[i]])),
      quotes: Object.fromEntries(QUO.map((k, i) => [k, quoteCounts[i]])),
      monthsRefreshed: refreshed,
    },
  };
}

export async function GET() {
  try {
    if (!cache || Date.now() - cache.at > CACHE_MS) cache = { at: Date.now(), data: await build() };
    return NextResponse.json(cache.data);
  } catch (e) {
    const notConnected = e instanceof JobberNotConnected;
    return NextResponse.json({ error: (e as Error).message, notConnected }, { status: notConnected ? 200 : 500 });
  }
}
