import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/apiGuard";
import { hashPassword } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { teacherUpdateSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return withRole("ADMIN", async (session) => {
    const parsed = teacherUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Please check the form fields." }, { status: 400 });
    }
    const { name, email, phone, isActive, newPassword, monthlySalary } = parsed.data;

    const teacher = await prisma.teacher.findUnique({ where: { id: params.id } });
    if (!teacher) return NextResponse.json({ error: "Teacher not found." }, { status: 404 });

    await prisma.teacher.update({
      where: { id: params.id },
      data: {
        name,
        email: email === "" ? null : email,
        phone: phone === "" ? null : phone,
        isActive,
        ...(monthlySalary !== undefined ? { monthlySalary } : {}),
      },
    });

    if (isActive !== undefined || newPassword) {
      await prisma.user.update({
        where: { id: teacher.userId },
        data: {
          ...(isActive !== undefined ? { isActive } : {}),
          ...(newPassword ? { passwordHash: await hashPassword(newPassword) } : {}),
        },
      });
    }

    const detailParts: string[] = [];
    if (monthlySalary !== undefined && monthlySalary !== teacher.monthlySalary) {
      detailParts.push("updated salary");
    }
    detailParts.push(newPassword ? "updated profile and reset password" : "updated profile");

    await writeAuditLog({
      userId: session.userId,
      action: "UPDATE_TEACHER",
      entityType: "Teacher",
      entityId: params.id,
      detail: detailParts.join(", "),
    });

    return NextResponse.json({ ok: true });
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  return withRole("ADMIN", async (session) => {
    const teacher = await prisma.teacher.findUnique({ where: { id: params.id } });
    if (!teacher) return NextResponse.json({ error: "Teacher not found." }, { status: 404 });

    await prisma.teacher.update({ where: { id: params.id }, data: { isActive: false } });
    await prisma.user.update({ where: { id: teacher.userId }, data: { isActive: false } });
    await prisma.class.updateMany({ where: { teacherId: params.id }, data: { teacherId: null } });

    await writeAuditLog({
      userId: session.userId,
      action: "DEACTIVATE_TEACHER",
      entityType: "Teacher",
      entityId: params.id,
      detail: `Deactivated teacher "${teacher.name}" and unassigned their classes`,
    });

    return NextResponse.json({ ok: true });
  });
}
