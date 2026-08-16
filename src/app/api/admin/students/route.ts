import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { withRole } from "@/lib/apiGuard";
import { writeAuditLog } from "@/lib/audit";
import { studentCreateSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export async function GET() {
  const prisma = getDb();
  return withRole("ADMIN", async () => {
    const students = await prisma.student.findMany({
      include: { enrollments: { include: { class: { select: { id: true, name: true } } } } },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ students });
  });
}

export async function POST(req: NextRequest) {
  const prisma = getDb();
  return withRole("ADMIN", async (session) => {
    const parsed = studentCreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Please check the form fields." }, { status: 400 });
    }
    const { name, parentPhone, classIds, membershipStart, membershipMonths } = parsed.data;

    const student = await prisma.student.create({
      data: {
        name,
        parentPhone: parentPhone || null,
        membershipStart: membershipStart ? new Date(membershipStart) : null,
        membershipMonths: membershipMonths ?? null,
        enrollments: classIds?.length
          ? { create: classIds.map((classId) => ({ classId })) }
          : undefined,
      },
    });

    await writeAuditLog({
      userId: session.userId,
      action: "CREATE_STUDENT",
      entityType: "Student",
      entityId: student.id,
      detail: `Created student "${name}"`,
    });

    return NextResponse.json({ student }, { status: 201 });
  });
}
