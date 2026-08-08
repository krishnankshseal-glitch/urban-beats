import { NextRequest, NextResponse } from "next/server";
import { revokeSession } from "@/lib/auth";
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
    return NextResponse.json({ ok: true });
  });
}
