import { NextRequest, NextResponse } from "next/server";
import { LOCATIONS, jobberQuery, loadConnection, parseLoc } from "@/lib/jobber";

export const dynamic = "force-dynamic";

/** Is Jobber connected, and does the stored connection still work? (No business data.) */
export async function GET(req: NextRequest) {
  const loc = parseLoc(req.nextUrl.searchParams.get("loc"));
  const location = LOCATIONS[loc].label;
  try {
    const conn = await loadConnection(loc);
    if (!conn) return NextResponse.json({ location, connected: false });
    try {
      const { account } = await jobberQuery<{ account: { name: string } }>("query { account { name } }", {}, undefined, loc);
      return NextResponse.json({ location, connected: true, working: true, account: account.name, connectedAt: conn.connectedAt });
    } catch (e) {
      return NextResponse.json({ location, connected: true, working: false, account: conn.account, error: (e as Error).message });
    }
  } catch (e) {
    return NextResponse.json({ connected: false, error: (e as Error).message }, { status: 500 });
  }
}
