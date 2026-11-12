import { NextRequest, NextResponse } from "next/server";
import { jobberQuery } from "@/lib/jobber";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Temporary: looks for anything in the Jobber account that separates Cincinnati work from Indianapolis.
// Returns totals grouped by state, city, tag, salesperson and custom-field setup. No client names or addresses.
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function attempt<T>(f: () => Promise<T>) {
  try {
    return await f();
  } catch (e) {
    return { error: (e as Error).message.slice(0, 300) };
  }
}

async function config() {
  const customFields = await attempt(async () => {
    const d = await jobberQuery<{ customFieldConfigurations: { nodes: Record<string, unknown>[] } }>(
      `query { customFieldConfigurations(first: 100) { nodes { ... on CustomFieldConfigurationInterface { name appliesTo valueType archived } } } }`
    );
    return d.customFieldConfigurations.nodes;
  });
  const taxRates = await attempt(async () => {
    const d = await jobberQuery<{ taxRates: { nodes: Record<string, unknown>[] } }>(`query { taxRates(first: 50) { nodes { name label tax default } } }`);
    return d.taxRates.nodes;
  });
  const account = await attempt(async () => (await jobberQuery<{ account: { name: string } }>(`query { account { name } }`)).account);
  return { account, customFields, taxRates };
}

type Inv = {
  invoiceStatus: string;
  amounts: { total: number };
  properties: { nodes: { address: { city: string | null; province: string | null; postalCode: string | null } | null }[] };
  client: { tags: { nodes: { label: string }[] } } | null;
  salesperson: { name: { full: string } } | null;
  taxDetails?: unknown;
};

async function month(ym: string) {
  const [y, mo] = ym.split("-").map(Number);
  const start = new Date(Date.UTC(y, mo - 1, 1));
  const end = new Date(Date.UTC(y, mo, 1));
  const filter = { issuedDate: { after: new Date(start.getTime() - 1).toISOString(), before: end.toISOString() } };
  const q = `query ($filter: InvoiceFilterAttributes, $after: String) {
    invoices(filter: $filter, first: 25, after: $after) {
      totalCount
      nodes {
        invoiceStatus amounts { total }
        properties(first: 3) { nodes { address { city province postalCode } } }
        client { tags(first: 10) { nodes { label } } }
        salesperson { name { full } }
      }
      pageInfo { hasNextPage endCursor }
    }
  }`;
  const byState: Record<string, { count: number; total: number }> = {};
  const byCity: Record<string, { count: number; total: number }> = {};
  const byZip3: Record<string, { count: number; total: number }> = {};
  const byTag: Record<string, { count: number; total: number }> = {};
  const bySales: Record<string, { count: number; total: number }> = {};
  const add = (m: Record<string, { count: number; total: number }>, k: string, t: number) => {
    m[k] ??= { count: 0, total: 0 };
    m[k].count++;
    m[k].total += t;
  };
  let after: string | null = null;
  let seen = 0;
  let totalCount = 0;
  const started = Date.now();
  for (let i = 0; i < 200 && Date.now() - started < 50_000; i++) {
    const d: { invoices: { totalCount: number; nodes: Inv[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } = await jobberQuery(q, { filter, after });
    totalCount = d.invoices.totalCount;
    for (const inv of d.invoices.nodes) {
      if (inv.invoiceStatus === "draft") continue;
      seen++;
      const t = n(inv.amounts?.total);
      const a = inv.properties?.nodes?.[0]?.address;
      const st = (a?.province || "?").trim().toUpperCase();
      add(byState, st, t);
      add(byCity, `${(a?.city || "?").trim()}, ${st}`, t);
      add(byZip3, (a?.postalCode || "?").trim().slice(0, 3), t);
      const tags = inv.client?.tags?.nodes?.map((x) => x.label) ?? [];
      if (!tags.length) add(byTag, "(no tags)", t);
      for (const tag of tags) add(byTag, tag, t);
      add(bySales, inv.salesperson?.name?.full || "(none)", t);
    }
    if (!d.invoices.pageInfo.hasNextPage) break;
    after = d.invoices.pageInfo.endCursor;
    await sleep(100);
  }
  const top = (m: Record<string, { count: number; total: number }>, k = 40) =>
    Object.entries(m)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, k)
      .map(([key, v]) => ({ key, count: v.count, total: Math.round(v.total) }));
  return { month: ym, totalCount, seen, complete: !after || seen >= totalCount, byState: top(byState), byCity: top(byCity), byZip3: top(byZip3, 20), byTag: top(byTag), bySalesperson: top(bySales) };
}

export async function GET(req: NextRequest) {
  const m = req.nextUrl.searchParams.get("month");
  try {
    if (m && /^\d{4}-\d{2}$/.test(m)) return NextResponse.json(await month(m));
    return NextResponse.json(await config());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
