import { NextRequest, NextResponse } from "next/server";
import { withRole } from "@/lib/apiGuard";
import { syncAttendanceSheetWithin } from "@/lib/syncAttendanceSheet";

export const runtime = "nodejs";

/** Admin counterpart: backs up one class-month to Drive right after edits. */
export async function POST(req: NextRequest) {
  return withRole("ADMIN", async () => {
    const body = await req.json().catch(() => null);
    const classId = typeof body?.classId === "string" ? body.classId : null;
    const year = Number(body?.year);
    const month = Number(body?.month);
    if (
      !classId ||
      !Number.isInteger(year) || year < 2000 || year > 2100 ||
      !Number.isInteger(month) || month < 1 || month > 12
    ) {
      return NextResponse.json({ error: "classId, year and month are required." }, { status: 400 });
    }
    const outcome = await syncAttendanceSheetWithin(classId, year, month);
    return NextResponse.json({ ok: true, backedUp: outcome.ok, error: outcome.ok ? undefined : outcome.error });
  });
}
