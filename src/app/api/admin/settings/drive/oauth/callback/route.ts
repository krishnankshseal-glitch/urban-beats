import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { withRole } from "@/lib/apiGuard";
import { writeAuditLog } from "@/lib/audit";
import { handleOAuthCallback } from "@/lib/googleDrive";

export const runtime = "nodejs";

const STATE_COOKIE = "drive_oauth_state";
const PKCE_COOKIE = "drive_oauth_pkce";

export async function GET(req: NextRequest) {
  return withRole("ADMIN", async (session) => {
    const code = req.nextUrl.searchParams.get("code");
    const error = req.nextUrl.searchParams.get("error");
    const returnedState = req.nextUrl.searchParams.get("state");
    const redirectTo = new URL("/admin/settings", req.url);

    const cookieStore = await cookies();
    const expectedState = cookieStore.get(STATE_COOKIE)?.value;
    const codeVerifier = cookieStore.get(PKCE_COOKIE)?.value;
    cookieStore.delete(STATE_COOKIE);
    cookieStore.delete(PKCE_COOKIE);

    if (error) {
      redirectTo.searchParams.set("drive_error", error === "access_denied" ? "Connection cancelled." : error);
      return NextResponse.redirect(redirectTo);
    }
    // Reject if the state Google sent back doesn't match what we set before
    // redirecting - this is what stops someone else from crafting a callback
    // URL and getting their own Google account silently linked to this app.
    if (!expectedState || returnedState !== expectedState) {
      redirectTo.searchParams.set("drive_error", "This connection request expired or wasn't recognized - try connecting again.");
      return NextResponse.redirect(redirectTo);
    }
    if (!code || !codeVerifier) {
      redirectTo.searchParams.set("drive_error", "Google didn't send back an authorization code.");
      return NextResponse.redirect(redirectTo);
    }

    const result = await handleOAuthCallback(code, codeVerifier);
    if (!result.ok) {
      redirectTo.searchParams.set("drive_error", result.message);
      return NextResponse.redirect(redirectTo);
    }

    await writeAuditLog({
      userId: session.userId,
      action: "CONNECT_DRIVE",
      entityType: "AppSetting",
      detail: result.message,
    });
    redirectTo.searchParams.set("drive_connected", "1");
    return NextResponse.redirect(redirectTo);
  });
}
