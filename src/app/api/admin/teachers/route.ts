import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { withRole } from "@/lib/apiGuard";
import { hashPassword } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { teacherCreateSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export async function GET() {
  const prisma = getDb();
  return withRole("ADMIN", async () => {
    const teachers = await prisma.teacher.findMany({
      include: { user: { select: { username: true, isActive: true } }, classes: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ teachers });
  });
}

export async function POST(req: NextRequest) {
  const prisma = getDb();
  return withRole("ADMIN", async (session) => {
    const parsed = teacherCreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Please check the form fields." }, { status: 400 });
    }
    const { name, username, password, email, phone, monthlySalary } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);

    const teacher = await prisma.teacher.create({
      data: {
        name,
        email: email || null,
        phone: phone || null,
        monthlySalary: monthlySalary ?? null,
        user: {
          create: { username, passwordHash, role: "TEACHER" },
        },
      },
      include: { user: { select: { username: true, isActive: true } } },
    });

    await writeAuditLog({
      userId: session.userId,
      action: "CREATE_TEACHER",
      entityType: "Teacher",
      entityId: teacher.id,
      detail: `Created teacher "${name}" (${username})`,
    });

    return NextResponse.json({ teacher }, { status: 201 });
  });
}
