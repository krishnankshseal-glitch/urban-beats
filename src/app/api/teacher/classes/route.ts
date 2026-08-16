import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { withRole } from "@/lib/apiGuard";

export const runtime = "nodejs";

export async function GET() {
  const prisma = getDb();
  return withRole("TEACHER", async (session) => {
    const teacher = await prisma.teacher.findUnique({ where: { userId: session.userId } });
    if (!teacher) return NextResponse.json({ classes: [] });

    const classes = await prisma.class.findMany({
      where: { teacherId: teacher.id, isActive: true },
      include: { enrollments: { where: { student: { isActive: true } } } },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      classes: classes.map((c) => ({
        id: c.id,
        name: c.name,
        schedule: c.schedule,
        studentCount: c.enrollments.length,
      })),
    });
  });
}
