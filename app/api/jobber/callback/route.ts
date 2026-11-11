import { NextRequest } from "next/server";
import { REDIRECT_URI, page } from "../shared";
import { exchangeCode, jobberQuery, loadConnection, saveConnection, verifyState } from "@/lib/jobber";

export const dynamic = "force-dynamic";

type AccountInfo = { account: { id: string; name: string } };
const ACCOUNT_QUERY = "query { account { id name } }";

/** Step 2: Jobber sends the admin back here after they approve. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  if (q.get("error")) return page("Jobber wasn't connected", `Jobber said: ${q.get("error_description") || q.get("error")}`, false);

  // The state must be one we signed, recent, and started in this same browser.
  const payload = verifyState(q.get("state") ?? "");
  const [nonce, ts] = (payload ?? "").split(":");
  if (!payload || nonce !== req.cookies.get("jobber_oauth")?.value || Date.now() - Number(ts) > 15 * 60_000) {
    return page("Link expired", "Please start again from the Connect Jobber link.", false);
  }
  const code = q.get("code");
  if (!code) return page("Jobber wasn't connected", "No approval code came back from Jobber. Please try the link again.", false);

  try {
    const tokens = await exchangeCode(code, REDIRECT_URI);
    if (!tokens.refresh_token) throw new Error("Jobber didn't return a refresh token");
    const { account } = await jobberQuery<AccountInfo>(ACCOUNT_QUERY, {}, tokens.access_token);

    // Don't let a different Jobber account replace a connection that still works.
    const existing = await loadConnection();
    if (existing && existing.accountId && existing.accountId !== account.id) {
      let stillWorks = false;
      try {
        await jobberQuery<AccountInfo>(ACCOUNT_QUERY);
        stillWorks = true;
      } catch {}
      if (stillWorks) {
        return page(
          "Already connected",
          `The dashboard is already connected to “${existing.account}”, so “${account.name}” wasn't connected. Disconnect it in Jobber first if you mean to switch accounts.`,
          false
        );
      }
    }

    await saveConnection({
      refreshToken: tokens.refresh_token,
      account: account.name,
      accountId: account.id,
      connectedAt: new Date().toISOString(),
    });
    const res = page("Jobber connected", `The dashboard can now read “${account.name}” (read-only). You can close this tab.`, true);
    return res;
  } catch (e) {
    return page("Jobber wasn't connected", (e as Error).message, false);
  }
}
