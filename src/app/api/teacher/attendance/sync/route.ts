import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/apiGuard";
import { syncAttendanceSheetWithin } from "@/lib/syncAttendanceSheet";
import { getStudioTodayAsUtcDate } from "@/lib/studioTime";

export const runtime = "nodejs";

/**
 * Called by the attendance page right after a save. The save itself answers
 * immediately (database only); this separate request does the Drive backup and
 * is awaited here, so the function stays alive until Drive has the new data -
 * unlike work started "in the background" after a response, which a serverless
 * function may freeze before it finishes.
 */
export async function POST(req: NextRequest) {
  return withRole("TEACHER", async (session) => {
    const body = await req.json().catch(() => null);
    const classId = typeof body?.classId === "string" ? body.classId : null;
    if (!classId) return NextResponse.json({ error: "classId is required." }, { status: 400 });

    const teacher = await prisma.teacher.findUnique({ where: { userId: session.userId }, select: { id: true } });
    const cls = teacher
      ? await prisma.class.findFirst({ where: { id: classId, teacherId: teacher.id, isActive: true }, select: { id: true } })
      : null;
    if (!cls) return NextResponse.json({ error: "You aren't assigned to this class." }, { status: 403 });

    const today = getStudioTodayAsUtcDate();
    const outcome = await syncAttendanceSheetWithin(classId, today.getUTCFullYear(), today.getUTCMonth() + 1);
    return NextResponse.json({ ok: true, backedUp: outcome.ok });
  });
}
