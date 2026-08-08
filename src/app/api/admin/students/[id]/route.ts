import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/apiGuard";
import { writeAuditLog } from "@/lib/audit";
import { studentUpdateSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return withRole("ADMIN", async (session) => {
    const parsed = studentUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Please check the form fields." }, { status: 400 });
    }
    const { name, parentPhone, classIds, membershipStart, membershipMonths, isActive } = parsed.data;

    const student = await prisma.student.findUnique({ where: { id: params.id } });
    if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });

    await prisma.student.update({
      where: { id: params.id },
      data: {
        name,
        parentPhone: parentPhone === "" ? null : parentPhone,
        membershipStart: membershipStart ? new Date(membershipStart) : undefined,
        membershipMonths,
        isActive,
      },
    });

    if (classIds) {
      await prisma.$transaction([
        prisma.enrollment.deleteMany({ where: { studentId: params.id } }),
        prisma.enrollment.createMany({
          data: classIds.map((classId) => ({ classId, studentId: params.id })),
          skipDuplicates: true,
        }),
      ]);
    }

    await writeAuditLog({
      userId: session.userId,
      action: "UPDATE_STUDENT",
      entityType: "Student",
      entityId: params.id,
      detail: `Updated student "${student.name}"`,
    });

    return NextResponse.json({ ok: true });
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  return withRole("ADMIN", async (session) => {
    const student = await prisma.student.findUnique({ where: { id: params.id } });
    if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });

    await prisma.student.update({ where: { id: params.id }, data: { isActive: false } });

    await writeAuditLog({
      userId: session.userId,
      action: "DEACTIVATE_STUDENT",
      entityType: "Student",
      entityId: params.id,
      detail: `Deactivated student "${student.name}"`,
    });

    return NextResponse.json({ ok: true });
  });
}
