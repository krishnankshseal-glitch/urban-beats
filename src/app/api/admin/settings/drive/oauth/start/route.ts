import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { withRole } from "@/lib/apiGuard";
import { getOAuthConsentUrl, generatePkcePair } from "@/lib/googleDrive";

export const runtime = "nodejs";

const STATE_COOKIE = "drive_oauth_state";
const PKCE_COOKIE = "drive_oauth_pkce";

export async function GET() {
  return withRole("ADMIN", async () => {
    const state = crypto.randomBytes(24).toString("base64url");
    const { verifier, challenge } = generatePkcePair();
    const url = getOAuthConsentUrl(state, challenge);
    if (!url) {
      return NextResponse.json(
        { error: "Drive OAuth isn't configured (GOOGLE_OAUTH_CLIENT_ID / SECRET / NEXT_PUBLIC_APP_URL)." },
        { status: 400 }
      );
    }
    // Short-lived, httpOnly - only the callback route needs to read these,
    // never client-side JS. state stops a forged callback (CSRF); the PKCE
    // verifier proves the same party that started this flow is the one
    // finishing it, on top of that.
    const cookieStore = await cookies();
    const cookieOpts = { httpOnly: true, secure: true, sameSite: "lax" as const, maxAge: 600, path: "/" };
    cookieStore.set(STATE_COOKIE, state, cookieOpts);
    cookieStore.set(PKCE_COOKIE, verifier, cookieOpts);
    return NextResponse.redirect(url);
  });
}
