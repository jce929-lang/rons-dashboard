import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { REDIRECT_URI } from "../shared";
import { jobberConfig, signState } from "@/lib/jobber";

export const dynamic = "force-dynamic";

/** Step 1: a Jobber admin opens this link once. It sends them to Jobber to approve read-only access. */
export async function GET(_req: NextRequest) {
  const { clientId } = jobberConfig();
  const nonce = crypto.randomBytes(16).toString("hex");
  const state = signState(`${nonce}:${Date.now()}`);
  const url = new URL("https://api.getjobber.com/api/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("state", state);
  const res = NextResponse.redirect(url.toString());
  res.cookies.set("jobber_oauth", nonce, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 15 * 60, path: "/api/jobber" });
  return res;
}
