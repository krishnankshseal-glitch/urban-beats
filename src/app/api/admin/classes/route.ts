import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/apiGuard";
import { writeAuditLog } from "@/lib/audit";
import { classCreateSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export async function GET() {
  return withRole("ADMIN", async () => {
    const classes = await prisma.class.findMany({
      include: {
        teacher: { select: { id: true, name: true } },
        enrollments: { include: { student: { select: { id: true, name: true, isActive: true } } } },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ classes });
  });
}

export async function POST(req: NextRequest) {
  return withRole("ADMIN", async (session) => {
    const parsed = classCreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Please check the form fields." }, { status: 400 });
    }
    const { name, schedule, description, teacherId } = parsed.data;

    const cls = await prisma.class.create({
      data: {
        name,
        schedule: schedule || null,
        description: description || null,
        teacherId: teacherId || null,
      },
    });

    await writeAuditLog({
      userId: session.userId,
      action: "CREATE_CLASS",
      entityType: "Class",
      entityId: cls.id,
      detail: `Created class "${name}"`,
    });

    return NextResponse.json({ class: cls }, { status: 201 });
  });
}
