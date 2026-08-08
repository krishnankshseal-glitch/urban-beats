import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, createSession, setSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

const bodySchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(8).max(200),
});

export async function POST(req: NextRequest) {
  const existingCount = await prisma.user.count();
  if (existingCount > 0) {
    return NextResponse.json(
      { error: "Setup has already been completed. Log in from the login page instead." },
      { status: 403 }
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Username needs 3+ characters and password needs 8+ characters." },
      { status: 400 }
    );
  }
  const { username, password } = parsed.data;

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: { username, passwordHash, role: "ADMIN" },
  });

  const { token, expiresAt } = await createSession({
    userId: user.id,
    role: "ADMIN",
    userAgent: req.headers.get("user-agent"),
    ipAddress: req.headers.get("x-forwarded-for"),
  });
  await setSessionCookie(token, expiresAt);

  return NextResponse.json({ ok: true, redirectTo: "/admin" });
}
