import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/apiGuard";
import { attendanceSubmitSchema } from "@/lib/schemas";
import { getMembershipInfo } from "@/lib/membership";
import { getStudioTodayAsUtcDate } from "@/lib/studioTime";
import { syncAttendanceSheet } from "@/lib/syncAttendanceSheet";

export const runtime = "nodejs";

const EDIT_WINDOW_MS = 30 * 60 * 1000;

async function assertOwnsClass(userId: string, classId: string) {
  const teacher = await prisma.teacher.findUnique({ where: { userId } });
  if (!teacher) return null;
  const cls = await prisma.class.findFirst({ where: { id: classId, teacherId: teacher.id, isActive: true } });
  return cls ? teacher : null;
}

export async function GET(req: NextRequest) {
  return withRole("TEACHER", async (session) => {
    const classId = new URL(req.url).searchParams.get("classId");
    if (!classId) return NextResponse.json({ error: "classId is required." }, { status: 400 });

    const teacher = await assertOwnsClass(session.userId, classId);
    if (!teacher) {
      return NextResponse.json({ error: "You don't have access to this class." }, { status: 403 });
    }

    const today = getStudioTodayAsUtcDate();

    const [enrollments, existingRows] = await Promise.all([
      prisma.enrollment.findMany({
        where: { classId, student: { isActive: true } },
        include: { student: true },
        orderBy: { student: { name: "asc" } },
      }),
      prisma.attendance.findMany({ where: { classId, date: today } }),
    ]);

    const existingByStudent = new Map(existingRows.map((r) => [r.studentId, r]));
    const editableUntil = existingRows[0]?.editableUntil ?? null;
    const locked = editableUntil ? new Date() > editableUntil : false;

    const roster = enrollments.map((e) => ({
      studentId: e.student.id,
      name: e.student.name,
      parentPhone: e.student.parentPhone,
      membership: getMembershipInfo(e.student).status,
      status: existingByStudent.get(e.student.id)?.status ?? null,
    }));

    return NextResponse.json({
      date: today.toISOString().slice(0, 10),
      roster,
      alreadySubmitted: existingRows.length > 0,
      editableUntil,
      locked,
    });
  });
}

export async function POST(req: NextRequest) {
  return withRole("TEACHER", async (session) => {
    const parsed = attendanceSubmitSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid submission." }, { status: 400 });
    }
    const { classId, records } = parsed.data;

    const teacher = await assertOwnsClass(session.userId, classId);
    if (!teacher) {
      return NextResponse.json({ error: "You don't have access to this class." }, { status: 403 });
    }

    const validStudentIds = new Set(
      (
        await prisma.enrollment.findMany({
          where: { classId, student: { isActive: true } },
          select: { studentId: true },
        })
      ).map((e) => e.studentId)
    );
    for (const r of records) {
      if (!validStudentIds.has(r.studentId)) {
        return NextResponse.json({ error: "One of these students isn't in this class." }, { status: 400 });
      }
    }

    const today = getStudioTodayAsUtcDate();
    const existingRows = await prisma.attendance.findMany({ where: { classId, date: today } });
    const now = new Date();

    if (existingRows.length > 0) {
      const referenceEditableUntil = existingRows[0].editableUntil;
      if (now > referenceEditableUntil) {
        return NextResponse.json(
          {
            error:
              "The 30-minute edit window for today's attendance has passed. What was submitted originally is final.",
          },
          { status: 423 }
        );
      }
    }

    const batchEditableUntil = existingRows[0]?.editableUntil ?? new Date(now.getTime() + EDIT_WINDOW_MS);
    const existingByStudent = new Map(existingRows.map((r) => [r.studentId, r]));

    await prisma.$transaction(
      records.map((r) => {
        const existing = existingByStudent.get(r.studentId);
        if (existing) {
          return prisma.attendance.update({
            where: { id: existing.id },
            data: { status: r.status, lastEditedAt: now, lastEditedById: session.userId },
          });
        }
        return prisma.attendance.create({
          data: {
            classId,
            studentId: r.studentId,
            date: today,
            status: r.status,
            submittedById: session.userId,
            submittedAt: now,
            editableUntil: batchEditableUntil,
          },
        });
      })
    );

    await syncAttendanceSheet(classId, today.getUTCFullYear(), today.getUTCMonth() + 1);

    return NextResponse.json({ ok: true, editableUntil: batchEditableUntil });
  });
}
