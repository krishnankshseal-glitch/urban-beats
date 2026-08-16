import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { withRole } from "@/lib/apiGuard";
import { buildWorkbookBufferForClassMonth } from "@/lib/syncAttendanceSheet";
import { sheetFilename } from "@/lib/excel";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const prisma = getDb();
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

    const buffer = await buildWorkbookBufferForClassMonth(classId, year, month);
    const filename = `${cls.name} - ${sheetFilename(year, month)}`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
      },
    });
  });
}
