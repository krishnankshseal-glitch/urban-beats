import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Landing point for "your session looked valid but the database says it's
 * revoked/expired" (force-logout from another tab, natural expiry, etc.).
 *
 * Server Components (like the admin/teacher layouts) are not allowed to set
 * cookies, so they cannot clear a stale session cookie themselves — they can
 * only redirect. If they redirected straight to /login, middleware's cheap
 * JWT-only check would still see a validly-signed cookie and immediately
 * bounce the request back to /admin or /teacher, which would bounce back
 * here again — an infinite redirect loop.
 *
 * Routing through this Route Handler first breaks that loop: it clears the
 * cookie (which Route Handlers ARE allowed to do), then redirects to /login.
 * By the time the browser lands on /login, there is no cookie left for
 * middleware to misread as "still logged in."
 */
export async function GET(req: NextRequest) {
  clearSessionCookie();
  return NextResponse.redirect(new URL("/login", req.url));
}
