import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/apiGuard";
import { hashPassword } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { adminCreateSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export async function GET() {
  return withRole("ADMIN", async () => {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { id: true, username: true, isActive: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ admins });
  });
}

export async function POST(req: NextRequest) {
  return withRole("ADMIN", async (session) => {
    const parsed = adminCreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Please check the form fields." }, { status: 400 });
    }
    const { username, password } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const admin = await prisma.user.create({
      data: { username, passwordHash, role: "ADMIN" },
      select: { id: true, username: true, isActive: true, createdAt: true },
    });

    await writeAuditLog({
      userId: session.userId,
      action: "CREATE_ADMIN",
      entityType: "User",
      entityId: admin.id,
      detail: `Created admin account "${username}"`,
    });

    return NextResponse.json({ admin }, { status: 201 });
  });
}
