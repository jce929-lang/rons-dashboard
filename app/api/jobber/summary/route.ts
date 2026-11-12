import { NextRequest, NextResponse } from "next/server";
import { JobberNotConnected, LOCATIONS, jobberQuery, parseLoc, type Loc } from "@/lib/jobber";
import { ensureSheet, readRange, writeRange } from "@/lib/sheets";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Mailbox & Streetscapes summary from Jobber. Totals only: no client names or addresses leave the server.
// Indianapolis and Cincinnati share one Jobber account, so every invoice, quote, request and job is
// assigned to an area by its property's zip code (see areaOf). One pull feeds both tabs.
// Cached per server instance for 10 minutes so the TV doesn't hammer Jobber's API.
const CACHE_MS = 10 * 60_000;
const AREAS = Object.keys(LOCATIONS) as Loc[];
let cache: { at: number; data: Record<Loc, Summary> } | null = null;
let inFlight: Promise<Record<Loc, Summary>> | null = null;
let pipeCache: { at: number; data: Pipe } | null = null; // the slow part, kept 10 minutes on its own

// Cincinnati territory, by the first 3 digits of the property's zip code (whether or not there's work there yet):
//   Ohio 450-452 Cincinnati metro (Mason, Lebanon, Hamilton, Clermont/Brown/Highland counties)
//   Ohio 453-454 Dayton area, 455 Springfield
//   Kentucky 410 Northern Kentucky (Covington, Florence, Independence, Williamstown)
//   Indiana 470 SE Indiana (Lawrenceburg, Aurora, Batesville, Brookville)
// Everything else is Indianapolis. Changing this list re-pulls every month (see SPLIT_RULE_SINCE).
const CINCY_ZIP3 = new Set(["450", "451", "452", "453", "454", "455", "410", "470"]);
const SPLIT_RULE_SINCE = Date.parse("2026-11-12T14:20:00Z"); // months saved before this used an older list
/** Saved under the current zip list, fully pulled, and (by default) less than a day old. */
const isFresh = (r: { refreshed: string } | undefined, maxAge = 24 * 3600_000) => {
  const at = r?.refreshed ? Date.parse(r.refreshed) : NaN;
  return at >= SPLIT_RULE_SINCE && Date.now() - at <= maxAge;
};
type Addr = { city: string | null; province: string | null; postalCode: string | null } | null | undefined;
function areaOf(a: Addr): Loc {
  const zip = (a?.postalCode ?? "").trim().slice(0, 3);
  if (/^\d{3}$/.test(zip)) return CINCY_ZIP3.has(zip) ? "cincinnati" : "indy";
  const st = (a?.province ?? "").trim().toUpperCase();
  const city = (a?.city ?? "").trim().toLowerCase();
  return st === "OH" || st === "OHIO" || city === "cincinnati" ? "cincinnati" : "indy";
}
const ADDR = "address { city province postalCode }";

type Page<T> = { nodes: T[]; pageInfo: { hasNextPage: boolean; endCursor: string | null }; totalCount?: number };

export type Summary = {
  updatedAt: string;
  location: string;
  months: { month: string; invoiced: number; paid: number; owed: number; invoices: number; complete: boolean }[];
  owed: { total: number; overdue: number; count: number; overdueCount: number };
  pipeline: {
    requests: number;
    quotesOut: { count: number; value: number };
    changesRequested: number;
    approved: { count: number; value: number };
    activeJobs: number;
    todayJobs: number;
    lateJobs: number;
    toInvoice: { count: number; value: number };
  };
  winRate: { won: number; quoted: number; days: number };
  // Counts by Jobber status, for checking what the pipeline numbers are made of.
  detail: { jobs: Record<string, number>; requests: Record<string, number>; monthsRefreshed: string[] };
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
const byArea = <T,>(xs: T[], area: (x: T) => Loc) => {
  const out = Object.fromEntries(AREAS.map((a) => [a, [] as T[]])) as Record<Loc, T[]>;
  for (const x of xs) out[area(x)].push(x);
  return out;
};

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
function filterType(field: string) {
  return { invoices: "InvoiceFilterAttributes", quotes: "QuoteFilterAttributes", jobs: "JobFilterAttributes", requests: "RequestFilterAttributes" }[field]!;
}

// ---------- monthly invoice totals, saved in one sheet tab per area ----------
// Pulling a year of invoices takes too long for one request, so each month is pulled on its own and saved.
// The current and previous month refresh every time; older months refresh once a day (payments still land on them).
const monthTab = (loc: Loc) => `Jobber Monthly - ${LOCATIONS[loc].label}`;
const MONTH_HEADER = ["Month", "Invoiced", "Paid", "Still owed", "Invoices", "Jobber count (all areas)", "Refreshed"];
type MonthRow = { month: string; invoiced: number; paid: number; owed: number; invoices: number; expected: number; refreshed: string };

async function readMonths(loc: Loc): Promise<Map<string, MonthRow>> {
  const tab = monthTab(loc);
  await ensureSheet(tab, [MONTH_HEADER]);
  const rows = await readRange(`${tab}!A2:G`);
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

async function writeMonths(loc: Loc, m: Map<string, MonthRow>) {
  const rows = [...m.values()].sort((a, b) => a.month.localeCompare(b.month));
  await writeRange(`${monthTab(loc)}!A1:G${rows.length + 1}`, [
    MONTH_HEADER,
    ...rows.map((r) => [`'${r.month}`, Math.round(r.invoiced * 100) / 100, Math.round(r.paid * 100) / 100, Math.round(r.owed * 100) / 100, r.invoices, r.expected, r.refreshed]),
  ]);
}

/** One month of invoices, split by area. */
async function pullMonth(month: string): Promise<Record<Loc, MonthRow>> {
  type Inv = { invoiceStatus: string; amounts: { total: number; invoiceBalance: number }; properties: { nodes: { address: Addr }[] } };
  const [y, mo] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, mo - 1, 1));
  const end = new Date(Date.UTC(y, mo, 1));
  const filter = { issuedDate: { after: new Date(start.getTime() - 1).toISOString(), before: end.toISOString() } };
  const fields = `invoiceStatus amounts { total invoiceBalance } properties(first: 1) { nodes { ${ADDR} } }`;
  const { nodes, total } = await allWithCount<Inv>("invoices", filter, fields, 160, 50);
  const refreshed = nodes.length < total ? "" : new Date().toISOString(); // didn't get everything: try again next time
  const rows = Object.fromEntries(
    AREAS.map((a) => [a, { month, invoiced: 0, paid: 0, owed: 0, invoices: 0, expected: Math.max(total, nodes.length), refreshed }])
  ) as Record<Loc, MonthRow>;
  for (const inv of nodes) {
    if (inv.invoiceStatus === "draft") continue;
    const row = rows[areaOf(inv.properties?.nodes?.[0]?.address)];
    const t = n(inv.amounts?.total);
    const bal = inv.invoiceStatus === "bad_debt" ? 0 : n(inv.amounts?.invoiceBalance);
    row.invoiced += t;
    row.owed += bal;
    row.paid += Math.max(0, t - bal);
    row.invoices++;
  }
  return rows;
}

const REQ = ["new", "assessment_completed", "upcoming", "today", "overdue", "unscheduled"];
const JOB = ["active", "upcoming", "today", "unscheduled", "action_required", "on_hold", "late"];

async function pullPipeline(winFrom: Date) {
  type P = { property: { address: Addr } | null };
  const area = (x: P) => areaOf(x.property?.address);
  type Owed = { invoiceStatus: string; amounts: { invoiceBalance: number }; properties: { nodes: { address: Addr }[] } };
  type Qt = P & { quoteStatus: string; createdAt: string; amounts: { total: number } };
  type Jb = P & { uninvoicedTotal?: number };
  type Rq = P;
  const PROP = `property { ${ADDR} }`;

  // ---- pipeline (pulled as lists so each item can be put in its area) ----
  const owedLists = await seq(["awaiting_payment", "sent_not_due", "past_due"], (status) =>
    all<Owed>("invoices", { status }, `invoiceStatus amounts { invoiceBalance } properties(first: 1) { nodes { ${ADDR} } }`)
  );
  const owedAll = byArea(
    owedLists.flat().filter((i) => n(i.amounts?.invoiceBalance) > 0),
    (i) => areaOf(i.properties?.nodes?.[0]?.address)
  );
  // Tag each item with the status it was listed under (that's what the counts mean).
  const requests = byArea(
    (await seq(REQ, async (status) => (await all<Rq>("requests", { status }, PROP)).map((r) => ({ ...r, status })))).flat(),
    area
  );
  const jobs = byArea(
    (await seq(JOB, async (status) => (await all<Jb>("jobs", { status }, PROP)).map((j) => ({ ...j, status })))).flat(),
    area
  );
  const toInvoice = byArea(await all<Jb>("jobs", { status: "requires_invoicing" }, `uninvoicedTotal ${PROP}`), area);
  const QF = `quoteStatus createdAt amounts { total } ${PROP}`;
  const approved = byArea(await all<Qt>("quotes", { status: "approved" }, QF), area);
  const changes = byArea(await all<Qt>("quotes", { status: "changes_requested" }, QF), area);
  // Last 90 days of quotes (drafts excluded). Lost quotes are rarely archived in this account, so
  // "close rate" = won / all quotes created, and "quotes out" only counts recent ones still waiting.
  const recent = byArea(
    (await all<Qt>("quotes", { createdAt: { after: iso(winFrom) } }, QF)).filter((q) => q.quoteStatus !== "draft"),
    area
  );

  return { owedAll, requests, jobs, toInvoice, approved, changes, recent };
}
type Pipe = Awaited<ReturnType<typeof pullPipeline>>;


async function build(): Promise<Record<Loc, Summary>> {
  const started = Date.now();
  const now = new Date();
  const firstMonth = new Date(now.getFullYear(), now.getMonth() - 12, 1); // this month + the 12 before it
  const winDays = 90;
  const winFrom = new Date(now.getTime() - winDays * 86400_000);

  // ---- invoices by issue month, from the saved monthly totals ----
  const saved = Object.fromEntries(await Promise.all(AREAS.map(async (a) => [a, await readMonths(a)] as const))) as Record<Loc, Map<string, MonthRow>>;
  const monthKeys: string[] = [];
  for (let d = new Date(firstMonth); d <= now; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const refreshed: string[] = [];
  const refresh = async (month: string) => {
    const rows = await pullMonth(month);
    for (const a of AREAS) saved[a].set(month, rows[a]);
    refreshed.push(month);
  };
  // 1) This month and last month change the most: always refresh them first.
  for (const month of monthKeys.slice(-2).reverse()) await refresh(month);

  // 2) Pipeline (open jobs, quotes, unpaid invoices) is the slow part, so it's kept 10 minutes on its own.
  if (!pipeCache || Date.now() - pipeCache.at > CACHE_MS) pipeCache = { at: Date.now(), data: await pullPipeline(winFrom) };
  const { owedAll, requests, jobs, toInvoice, approved, changes, recent } = pipeCache.data;

  // 3) Older months: re-pull any that are a day old or saved under an older zip list, newest first, while time allows.
  for (const month of monthKeys.slice(0, -2).reverse()) {
    if (!AREAS.some((a) => !isFresh(saved[a].get(month)))) continue;
    if (Date.now() - started > 38_000) break; // out of time this run; the next refresh picks it up
    await refresh(month);
  }
  if (refreshed.length) for (const a of AREAS) await writeMonths(a, saved[a]);

  const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
  const tally = (xs: { s: string }[], keys: string[]) => Object.fromEntries(keys.map((k) => [k, xs.filter((x) => x.s === k).length]));

  const out = {} as Record<Loc, Summary>;
  for (const a of AREAS) {
    const owed = owedAll[a];
    const overdue = owed.filter((i) => i.invoiceStatus === "past_due");
    const jb = jobs[a];
    const late = jb.filter((j) => j.status === "late").length;
    const today = jb.filter((j) => j.status === "today").length;
    const rec = recent[a];
    const recentOut = rec.filter((q) => q.quoteStatus === "awaiting_response");
    out[a] = {
      updatedAt: now.toISOString(),
      location: LOCATIONS[a].label,
      months: monthKeys.map((m) => {
        const r = saved[a].get(m);
        return { month: m, invoiced: r?.invoiced ?? 0, paid: r?.paid ?? 0, owed: r?.owed ?? 0, invoices: r?.invoices ?? 0, complete: isFresh(r, Infinity) };
      }),
      owed: {
        total: sum(owed, (i) => n(i.amounts.invoiceBalance)),
        overdue: sum(overdue, (i) => n(i.amounts.invoiceBalance)),
        count: owed.length,
        overdueCount: overdue.length,
      },
      pipeline: {
        requests: requests[a].length,
        quotesOut: { count: recentOut.length, value: sum(recentOut, (q) => n(q.amounts?.total)) },
        changesRequested: changes[a].length,
        approved: { count: approved[a].length, value: sum(approved[a], (q) => n(q.amounts?.total)) },
        activeJobs: jb.length,
        todayJobs: today,
        lateJobs: late,
        toInvoice: { count: toInvoice[a].length, value: sum(toInvoice[a], (j) => n(j.uninvoicedTotal)) },
      },
      winRate: { won: rec.filter((q) => q.quoteStatus === "approved" || q.quoteStatus === "converted").length, quoted: rec.length, days: winDays },
      detail: {
        jobs: { ...tally(jb.map((j) => ({ s: j.status })), JOB), requires_invoicing: toInvoice[a].length },
        requests: tally(requests[a].map((r) => ({ s: r.status })), REQ),
        monthsRefreshed: refreshed,
      },
    };
  }
  return out;
}

export async function GET(req: NextRequest) {
  const loc = parseLoc(req.nextUrl.searchParams.get("loc"));
  try {
    // Keep a partial result (older months still loading) for only a minute so the backfill keeps going.
    const partial = cache && AREAS.some((a) => cache!.data[a].months.some((m) => !m.complete));
    const ttl = partial ? 60_000 : CACHE_MS;
    if (!cache || Date.now() - cache.at > ttl) {
      // Both tabs share one pull; if one is already running, wait for it instead of starting another.
      inFlight ??= build().finally(() => (inFlight = null));
      cache = { at: Date.now(), data: await inFlight };
    }
    return NextResponse.json(cache.data[loc]);
  } catch (e) {
    const notConnected = e instanceof JobberNotConnected;
    return NextResponse.json({ error: (e as Error).message, notConnected }, { status: notConnected ? 200 : 500 });
  }
}
