import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { createSession, setSessionCookie, verifyPassword, hashPassword } from "@/lib/auth";

export const runtime = "nodejs";

const bodySchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(200),
});

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// A fixed dummy hash so that "user not found" and "wrong password" take
// roughly the same amount of time — avoids leaking which usernames exist.
const DUMMY_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEeOa1FyzVjO4bC7B3Q0eOR6E1XX7v6H4Ha";

export async function POST(req: NextRequest) {
  const prisma = getDb();
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { username, password } = parsed.data;

  const genericError = () =>
    NextResponse.json({ error: "Invalid username or password." }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { username } });

  if (!user) {
    await verifyPassword(password, DUMMY_HASH); // normalize timing
    return genericError();
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return NextResponse.json(
      { error: `Account temporarily locked. Try again after ${user.lockedUntil.toLocaleTimeString()}.` },
      { status: 423 }
    );
  }

  if (!user.isActive) {
    return genericError();
  }

  const valid = await verifyPassword(password, user.passwordHash);

  if (!valid) {
    const attempts = user.failedLoginAttempts + 1;
    const lockedUntil =
      attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: lockedUntil ? 0 : attempts,
        lockedUntil,
      },
    });

    if (lockedUntil) {
      return NextResponse.json(
        { error: `Too many failed attempts. Account locked for ${LOCKOUT_MINUTES} minutes.` },
        { status: 423 }
      );
    }
    return genericError();
  }

  // Success — reset lockout counters.
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  });

  const { token, expiresAt } = await createSession({
    userId: user.id,
    role: user.role,
    userAgent: req.headers.get("user-agent"),
    ipAddress: req.headers.get("x-forwarded-for"),
  });

  await setSessionCookie(token, expiresAt);

  return NextResponse.json({
    ok: true,
    role: user.role,
    redirectTo: user.role === "ADMIN" ? "/admin" : "/teacher",
  });
}
