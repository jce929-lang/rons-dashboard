import { NextRequest, NextResponse } from "next/server";
import { jobberQuery } from "@/lib/jobber";

export const dynamic = "force-dynamic";

// Field names and types only (GraphQL introspection), for designing the mailbox pane. No business data, so any type name can be looked up.

const Q = `query ($name: String!) { __type(name: $name) { name kind
  fields { name type { name kind ofType { name kind ofType { name kind } } } args { name type { name kind ofType { name kind } } } }
  inputFields { name type { name kind ofType { name kind } } }
  enumValues { name } } }`;

export async function GET(req: NextRequest) {
  const names = (req.nextUrl.searchParams.get("types") ?? "Query").split(",").map((s) => s.trim()).filter((s) => /^[A-Za-z_][A-Za-z0-9_]{0,80}$/.test(s));
  try {
    const out: Record<string, unknown> = {};
    for (const name of names) out[name] = (await jobberQuery<{ __type: unknown }>(Q, { name })).__type;
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
