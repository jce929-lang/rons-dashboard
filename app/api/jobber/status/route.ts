import { NextResponse } from "next/server";
import { jobberQuery, loadConnection } from "@/lib/jobber";

export const dynamic = "force-dynamic";

/** Is Jobber connected, and does the stored connection still work? (No business data.) */
export async function GET() {
  try {
    const conn = await loadConnection();
    if (!conn) return NextResponse.json({ connected: false });
    try {
      const { account } = await jobberQuery<{ account: { name: string } }>("query { account { name } }");
      return NextResponse.json({ connected: true, working: true, account: account.name, connectedAt: conn.connectedAt });
    } catch (e) {
      return NextResponse.json({ connected: true, working: false, account: conn.account, error: (e as Error).message });
    }
  } catch (e) {
    return NextResponse.json({ connected: false, error: (e as Error).message }, { status: 500 });
  }
}
