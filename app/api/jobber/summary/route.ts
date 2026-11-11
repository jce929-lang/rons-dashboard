import { NextResponse } from "next/server";
import { JobberNotConnected, jobberQuery } from "@/lib/jobber";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Mailbox & Streetscapes summary from Jobber. Totals only: no client names or addresses leave the server.
// Cached per server instance for 10 minutes so the TV doesn't hammer Jobber's API.
const CACHE_MS = 10 * 60_000;
let cache: { at: number; data: Summary } | null = null;

type Page<T> = { nodes: T[]; pageInfo: { hasNextPage: boolean; endCursor: string | null }; totalCount?: number };

export type Summary = {
  updatedAt: string;
  months: { month: string; invoiced: number; paid: number; owed: number }[];
  owed: { total: number; overdue: number; count: number; overdueCount: number };
  pipeline: {
    requests: number;
    quotesOut: { count: number; value: number };
    changesRequested: number;
    approved: { count: number; value: number };
    activeJobs: number;
    lateJobs: number;
    toInvoice: { count: number; value: number };
  };
  winRate: { won: number; decided: number; sent: number; days: number };
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

/** Walk every page of a connection (50 at a time, capped so one call can't run away). */
async function all<T>(field: string, filter: Record<string, unknown>, nodeFields: string, maxPages = 30): Promise<T[]> {
  const q = `query ($filter: ${filterType(field)}, $after: String) {
    ${field}(filter: $filter, first: 50, after: $after) { nodes { ${nodeFields} } pageInfo { hasNextPage endCursor } }
  }`;
  const out: T[] = [];
  let after: string | null = null;
  for (let i = 0; i < maxPages; i++) {
    const data: Record<string, Page<T>> = await jobberQuery(q, { filter, after });
    const page: Page<T> = data[field];
    out.push(...page.nodes);
    if (!page.pageInfo.hasNextPage) break;
    after = page.pageInfo.endCursor;
    await sleep(150); // stay well under Jobber's rate limit
  }
  return out;
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

  type Inv = { issuedDate: string | null; invoiceStatus: string; amounts: { total: number; invoiceBalance: number } };
  type Owed = { invoiceStatus: string; amounts: { invoiceBalance: number } };
  type Qt = { quoteStatus: string; amounts: { total: number } };
  type Jb = { uninvoicedTotal: number };

  // Invoices issued over the last 13 months, bucketed by issue month.
  const invoices = await all<Inv>("invoices", { issuedDate: { after: iso(firstMonth) } }, "issuedDate invoiceStatus amounts { total invoiceBalance }");
  const byMonth = new Map<string, { invoiced: number; paid: number; owed: number }>();
  for (let d = new Date(firstMonth); d <= now; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    byMonth.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, { invoiced: 0, paid: 0, owed: 0 });
  }
  for (const inv of invoices) {
    if (!inv.issuedDate || inv.invoiceStatus === "draft") continue;
    const m = byMonth.get(inv.issuedDate.slice(0, 7));
    if (!m) continue;
    const total = n(inv.amounts?.total);
    const balance = inv.invoiceStatus === "bad_debt" ? 0 : n(inv.amounts?.invoiceBalance);
    m.invoiced += total;
    m.owed += balance;
    m.paid += Math.max(0, total - balance);
  }

  // Everything still owed, any age.
  const owedLists = await seq(["awaiting_payment", "sent_not_due", "past_due"], (status) =>
    all<Owed>("invoices", { status }, "invoiceStatus amounts { invoiceBalance }")
  );
  const owedAll = owedLists.flat().filter((i) => n(i.amounts?.invoiceBalance) > 0);
  const overdue = owedAll.filter((i) => i.invoiceStatus === "past_due");

  // Pipeline.
  const quotesOut = await all<Qt>("quotes", { status: "awaiting_response" }, "quoteStatus amounts { total }");
  const approved = await all<Qt>("quotes", { status: "approved" }, "quoteStatus amounts { total }");
  const changesRequested = await count("quotes", { status: "changes_requested" });
  const requestCounts = await seq(["new", "assessment_completed", "upcoming", "today", "overdue", "unscheduled"], (status) =>
    count("requests", { status })
  );
  const activeCounts = await seq(["active", "upcoming", "today", "unscheduled", "action_required", "on_hold"], (status) =>
    count("jobs", { status })
  );
  const lateJobs = await count("jobs", { status: "late" });
  const toInvoice = await all<Jb>("jobs", { status: "requires_invoicing" }, "uninvoicedTotal");

  // Quote win rate over the last 90 days (quotes sent in that window).
  const recent = await all<Qt>("quotes", { sentAt: { after: iso(winFrom) } }, "quoteStatus amounts { total }");
  const won = recent.filter((q) => q.quoteStatus === "approved" || q.quoteStatus === "converted").length;
  const lost = recent.filter((q) => q.quoteStatus === "archived").length;

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
      quotesOut: { count: quotesOut.length, value: sum(quotesOut, (q) => n(q.amounts?.total)) },
      changesRequested,
      approved: { count: approved.length, value: sum(approved, (q) => n(q.amounts?.total)) },
      activeJobs: activeCounts.reduce((a, b) => a + b, 0) + lateJobs,
      lateJobs,
      toInvoice: { count: toInvoice.length, value: sum(toInvoice, (j) => n(j.uninvoicedTotal)) },
    },
    winRate: { won, decided: won + lost, sent: recent.length, days: winDays },
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
