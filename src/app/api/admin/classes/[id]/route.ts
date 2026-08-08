import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/apiGuard";
import { writeAuditLog } from "@/lib/audit";
import { classUpdateSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return withRole("ADMIN", async (session) => {
    const parsed = classUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Please check the form fields." }, { status: 400 });
    }
    const { name, schedule, description, teacherId, isActive } = parsed.data;

    const cls = await prisma.class.findUnique({ where: { id: params.id } });
    if (!cls) return NextResponse.json({ error: "Class not found." }, { status: 404 });

    await prisma.class.update({
      where: { id: params.id },
      data: {
        name,
        schedule: schedule === "" ? null : schedule,
        description: description === "" ? null : description,
        teacherId: teacherId === "" ? null : teacherId,
        isActive,
      },
    });

    await writeAuditLog({
      userId: session.userId,
      action: "UPDATE_CLASS",
      entityType: "Class",
      entityId: params.id,
      detail: `Updated class "${cls.name}"`,
    });

    return NextResponse.json({ ok: true });
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  return withRole("ADMIN", async (session) => {
    const cls = await prisma.class.findUnique({ where: { id: params.id } });
    if (!cls) return NextResponse.json({ error: "Class not found." }, { status: 404 });

    await prisma.class.update({ where: { id: params.id }, data: { isActive: false } });

    await writeAuditLog({
      userId: session.userId,
      action: "DEACTIVATE_CLASS",
      entityType: "Class",
      entityId: params.id,
      detail: `Deactivated class "${cls.name}"`,
    });

    return NextResponse.json({ ok: true });
  });
}
