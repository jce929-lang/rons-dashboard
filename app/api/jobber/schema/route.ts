import { NextRequest, NextResponse } from "next/server";
import { jobberQuery } from "@/lib/jobber";

export const dynamic = "force-dynamic";

// Field names and types only (GraphQL introspection), for designing the mailbox pane. No business data.
const ALLOWED = new Set(["Query", "Invoice", "Job", "Quote", "Request", "Client", "Amounts", "InvoiceAmounts", "QuoteAmounts", "JobAmounts", "Payment", "PaymentRecord", "Visit", "LineItem", "Property", "InvoiceFilterAttributes", "JobFilterAttributes", "QuoteFilterAttributes", "RequestFilterAttributes", "InvoiceConnection", "JobConnection", "QuoteConnection", "RequestConnection", "InvoiceStatusTypeEnum", "JobStatusTypeEnum", "QuoteStatusTypeEnum", "RequestStatusTypeEnum", "Iso8601DateTimeRangeInput", "PageInfo", "PaymentRecord", "PaymentRecordFilterAttributes", "JobBalanceTotals"]);

const Q = `query ($name: String!) { __type(name: $name) { name kind
  fields { name type { name kind ofType { name kind ofType { name kind } } } args { name type { name kind ofType { name kind } } } }
  inputFields { name type { name kind ofType { name kind } } }
  enumValues { name } } }`;

export async function GET(req: NextRequest) {
  const names = (req.nextUrl.searchParams.get("types") ?? "Query").split(",").map((s) => s.trim()).filter((s) => ALLOWED.has(s));
  try {
    const out: Record<string, unknown> = {};
    for (const name of names) out[name] = (await jobberQuery<{ __type: unknown }>(Q, { name })).__type;
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
