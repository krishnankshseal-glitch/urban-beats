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
    const { name, parentPhone, studentCode, classIds, isActive } = parsed.data;

    const student = await prisma.student.findUnique({ where: { id: params.id } });
    if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });

    await prisma.student.update({
      where: { id: params.id },
      data: {
        name,
        parentPhone: parentPhone === "" ? null : parentPhone,
        studentCode: studentCode === "" ? null : studentCode,
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
    const student = await prisma.student.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, studentCode: true },
    });
    if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });

    // Which class sheets currently show this student? Their Excel backups have
    // to be rebuilt without them, so work that out before the rows are gone.
    const marks = await prisma.attendance.findMany({
      where: { studentId: params.id },
      select: { classId: true, date: true },
    });
    const affectedByKey = new Map<string, { classId: string; year: number; month: number }>();
    for (const m of marks) {
      const year = m.date.getUTCFullYear();
      const month = m.date.getUTCMonth() + 1;
      affectedByKey.set(`${m.classId}|${year}|${month}`, { classId: m.classId, year, month });
    }
    const affected = Array.from(affectedByKey.values());

    // Flag those sheets as needing a refresh first (the background reconcile
    // job picks up anything flagged), then delete. Deleting the student also
    // removes their enrolments and attendance, which cascade.
    if (affected.length > 0) {
      await prisma.sheetMetadata.updateMany({
        where: {
          status: { not: "closed" },
          OR: affected.map((a) => ({ classId: a.classId, year: a.year, month: a.month })),
        },
        data: { lastSyncedAt: null },
      });
    }
    await prisma.student.delete({ where: { id: params.id } });

    await writeAuditLog({
      userId: session.userId,
      action: "DELETE_STUDENT",
      entityType: "Student",
      entityId: params.id,
      detail: `Deleted student "${student.name}"${student.studentCode ? ` (ID ${student.studentCode})` : ""} and their ${marks.length} attendance record(s)`,
    });

    return NextResponse.json({ ok: true, affected });
  });
}
