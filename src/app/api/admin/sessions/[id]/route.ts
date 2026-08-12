import { NextRequest, NextResponse } from "next/server";
import { revokeSession, getSession, clearSessionCookie } from "@/lib/auth";
import { withRole } from "@/lib/apiGuard";
import { writeAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  return withRole("ADMIN", async (session) => {
    await revokeSession(params.id);
    await writeAuditLog({
      userId: session.userId,
      action: "FORCE_LOGOUT",
      entityType: "Session",
      entityId: params.id,
    });

    // If that revoke just invalidated the caller's own current session
    // (they force-logged-out themselves), clear their cookie immediately
    // rather than leaving their browser holding a JWT that still looks
    // valid but points at a revoked row.
    const stillSignedIn = await getSession();
    if (!stillSignedIn) {
      clearSessionCookie();
      return NextResponse.json({ ok: true, selfLoggedOut: true });
    }

    return NextResponse.json({ ok: true });
  });
}
