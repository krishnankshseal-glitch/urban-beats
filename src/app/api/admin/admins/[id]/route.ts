import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/apiGuard";
import { writeAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  return withRole("ADMIN", async (session) => {
    if (params.id === session.userId) {
      return NextResponse.json({ error: "You can't deactivate your own account." }, { status: 400 });
    }

    const target = await prisma.user.findUnique({ where: { id: params.id } });
    if (!target || target.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin not found." }, { status: 404 });
    }

    const activeAdminCount = await prisma.user.count({ where: { role: "ADMIN", isActive: true } });
    if (activeAdminCount <= 1) {
      return NextResponse.json(
        { error: "Can't deactivate the last remaining admin." },
        { status: 400 }
      );
    }

    await prisma.user.update({ where: { id: params.id }, data: { isActive: false } });
    await prisma.session.updateMany({
      where: { userId: params.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await writeAuditLog({
      userId: session.userId,
      action: "DEACTIVATE_ADMIN",
      entityType: "User",
      entityId: params.id,
      detail: `Deactivated admin "${target.username}"`,
    });

    return NextResponse.json({ ok: true });
  });
}
