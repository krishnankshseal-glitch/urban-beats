import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { withRole } from "@/lib/apiGuard";
import { writeAuditLog } from "@/lib/audit";
import { enrollmentUpdateSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const prisma = getDb();
  return withRole("ADMIN", async (session) => {
    const parsed = enrollmentUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    const { studentIds } = parsed.data;

    const cls = await prisma.class.findUnique({ where: { id: params.id } });
    if (!cls) return NextResponse.json({ error: "Class not found." }, { status: 404 });

    await prisma.$transaction([
      prisma.enrollment.deleteMany({ where: { classId: params.id } }),
      prisma.enrollment.createMany({
        data: studentIds.map((studentId) => ({ classId: params.id, studentId })),
        skipDuplicates: true,
      }),
    ]);

    await writeAuditLog({
      userId: session.userId,
      action: "UPDATE_ROSTER",
      entityType: "Class",
      entityId: params.id,
      detail: `Set roster to ${studentIds.length} student(s)`,
    });

    return NextResponse.json({ ok: true });
  });
}
