import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, hashPassword, verifyPassword } from "@/lib/auth";
import { changePasswordSchema } from "@/lib/schemas";
import { writeAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

// Self-service password change for the logged-in user (admin or teacher —
// deliberately not role-gated, since anyone should be able to change their
// own password). Requires the current password to confirm it's really them,
// not just someone at an already-unlocked screen.
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Please log in." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter your current password and a new password (min 8 characters)." }, { status: 400 });
  }
  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  }

  const newHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });

  // Security best practice: a password change should sign out every other
  // device/session, since the old password may have been compromised —
  // that's presumably why it's being changed. The session making this
  // request stays valid so the user isn't immediately logged out themselves.
  await prisma.session.updateMany({
    where: { userId: user.id, revokedAt: null, id: { not: session.sessionId } },
    data: { revokedAt: new Date() },
  });

  await writeAuditLog({
    userId: session.userId,
    action: "CHANGE_OWN_PASSWORD",
    entityType: "User",
    entityId: user.id,
    detail: "Changed their own password; other active sessions were signed out",
  });

  return NextResponse.json({ ok: true });
}
