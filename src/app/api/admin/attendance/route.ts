import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/apiGuard";
import { writeAuditLog } from "@/lib/audit";
import { attendanceAdminEditSchema } from "@/lib/schemas";
import { toUtcDateOnly } from "@/lib/studioTime";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return withRole("ADMIN", async () => {
    const { searchParams } = new URL(req.url);
    const classId = searchParams.get("classId");
    const year = Number(searchParams.get("year"));
    const month = Number(searchParams.get("month"));
    if (!classId || !year || !month) {
      return NextResponse.json({ error: "classId, year, and month are required." }, { status: 400 });
    }

    const cls = await prisma.class.findUnique({ where: { id: classId } });
    if (!cls) return NextResponse.json({ error: "Class not found." }, { status: 404 });

    const enrollments = await prisma.enrollment.findMany({
      where: { classId, student: { isActive: true } },
      include: { student: true },
      orderBy: { student: { name: "asc" } },
    });

    const startOfMonth = new Date(Date.UTC(year, month - 1, 1));
    const startOfNextMonth = new Date(Date.UTC(year, month, 1));
    const attendanceRows = await prisma.attendance.findMany({
      where: { classId, date: { gte: startOfMonth, lt: startOfNextMonth } },
    });

    const attendanceMap: Record<string, Record<number, "PRESENT" | "ABSENT">> = {};
    for (const row of attendanceRows) {
      const day = row.date.getUTCDate();
      attendanceMap[row.studentId] = attendanceMap[row.studentId] ?? {};
      attendanceMap[row.studentId][day] = row.status;
    }

    const sheetMeta = await prisma.sheetMetadata.findUnique({
      where: { classId_year_month: { classId, year, month } },
    });

    const students = enrollments.map((e) => ({
      id: e.student.id,
      name: e.student.name,
    }));

    return NextResponse.json({
      class: { id: cls.id, name: cls.name },
      students,
      attendance: attendanceMap,
      sheet: sheetMeta
        ? {
            driveWebViewLink: sheetMeta.driveWebViewLink,
            lastSyncedAt: sheetMeta.lastSyncedAt,
            syncError: sheetMeta.syncError,
          }
        : null,
    });
  });
}

export async function PATCH(req: NextRequest) {
  return withRole("ADMIN", async (session) => {
    const parsed = attendanceAdminEditSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid edit." }, { status: 400 });
    }
    const { classId, studentId, date, status } = parsed.data;
    const day = toUtcDateOnly(new Date(date));

    // Once a month has been archived to Drive its rows are deleted from the
    // database; editing it would also trigger a re-sync that overwrote the
    // complete archive with an almost empty sheet.
    const archived = await prisma.sheetMetadata.findUnique({
      where: { classId_year_month: { classId, year: day.getUTCFullYear(), month: day.getUTCMonth() + 1 } },
      select: { status: true },
    });
    if (archived?.status === "closed") {
      return NextResponse.json(
        { error: "That month has been archived to Google Drive and can no longer be edited here. The Excel file in Drive is the permanent record." },
        { status: 409 }
      );
    }

    if (status === "CLEAR") {
      await prisma.attendance.deleteMany({ where: { classId, studentId, date: day } });
    } else {
      await prisma.attendance.upsert({
        where: { classId_studentId_date: { classId, studentId, date: day } },
        update: { status, lastEditedAt: new Date(), lastEditedById: session.userId },
        create: {
          classId,
          studentId,
          date: day,
          status,
          submittedById: session.userId,
          editableUntil: new Date(),
        },
      });
    }

    await writeAuditLog({
      userId: session.userId,
      action: "EDIT_ATTENDANCE",
      entityType: "Attendance",
      entityId: `${classId}:${studentId}:${date}`,
      detail: `Set ${date} to ${status}`,
    });

    // The Drive backup runs as its own request (POST /api/admin/attendance/sync)
    // that the page sends right after this returns - not as background work
    // here, which the serverless platform may freeze before it finishes.
    return NextResponse.json({ ok: true });
  });
}
