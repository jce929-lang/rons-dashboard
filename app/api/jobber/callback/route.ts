import { NextRequest } from "next/server";
import { REDIRECT_URI, page } from "../shared";
import { LOCATIONS, exchangeCode, jobberQuery, loadConnection, parseLoc, saveConnection, verifyState, type Loc } from "@/lib/jobber";

export const dynamic = "force-dynamic";

type AccountInfo = { account: { id: string; name: string } };
const ACCOUNT_QUERY = "query { account { id name } }";

/** Step 2: Jobber sends the admin back here after they approve. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  if (q.get("error")) return page("Jobber wasn't connected", `Jobber said: ${q.get("error_description") || q.get("error")}`, false);

  // The state must be one we signed, recent, and started in this same browser.
  const payload = verifyState(q.get("state") ?? "");
  const [nonce, ts, locRaw] = (payload ?? "").split(":");
  const loc = parseLoc(locRaw);
  const label = LOCATIONS[loc].label;
  if (!payload || nonce !== req.cookies.get("jobber_oauth")?.value || Date.now() - Number(ts) > 15 * 60_000) {
    return page("Link expired", "Please start again from the Connect Jobber link you were sent.", false);
  }
  const code = q.get("code");
  if (!code) return page("Jobber wasn't connected", "No approval code came back from Jobber. Please try the link again.", false);

  try {
    const tokens = await exchangeCode(code, REDIRECT_URI);
    if (!tokens.refresh_token) throw new Error("Jobber didn't return a refresh token");
    const { account } = await jobberQuery<AccountInfo>(ACCOUNT_QUERY, {}, tokens.access_token);

    // Each location needs its own Jobber account: refuse one that's already connected for another location
    // (easy to do by accident when that account is the one signed in to Jobber in this browser).
    for (const other of Object.keys(LOCATIONS) as Loc[]) {
      if (other === loc) continue;
      const theirs = await loadConnection(other);
      if (theirs?.accountId === account.id) {
        return page(
          "That's the wrong Jobber account",
          `“${account.name}” is already connected as ${LOCATIONS[other].label}. To connect ${label}, sign out of Jobber (or open a private window), sign in to the ${label} Jobber account, and open the connect link again.`,
          false
        );
      }
    }

    // Don't let a different Jobber account replace a connection that still works.
    const existing = await loadConnection(loc);
    if (existing && existing.accountId && existing.accountId !== account.id) {
      let stillWorks = false;
      try {
        await jobberQuery<AccountInfo>(ACCOUNT_QUERY, {}, undefined, loc);
        stillWorks = true;
      } catch {}
      if (stillWorks) {
        return page(
          "Already connected",
          `${label} is already connected to “${existing.account}”, so “${account.name}” wasn't connected. Disconnect it in Jobber first if you mean to switch accounts.`,
          false
        );
      }
    }

    await saveConnection(
      {
        refreshToken: tokens.refresh_token,
        account: account.name,
        accountId: account.id,
        connectedAt: new Date().toISOString(),
      },
      loc
    );
    const res = page("Jobber connected", `The dashboard can now read “${account.name}” for ${label} (read-only). You can close this tab.`, true);
    return res;
  } catch (e) {
    return page("Jobber wasn't connected", (e as Error).message, false);
  }
}
