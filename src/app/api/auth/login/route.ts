import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession, setSessionCookie, verifyPassword, hashPassword, passwordNeedsRehash } from "@/lib/auth";
import { successfulLoginUpdate } from "@/lib/loginSuccess";

export const runtime = "nodejs";

const bodySchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(200),
});

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// A fixed dummy hash so that "user not found" and "wrong password" take
// roughly the same amount of time — avoids leaking which usernames exist.
const DUMMY_HASH = "$2a$10$Iocd0WuDXLxykd4KefDtqudJcpAsR0qHBR2liMHfbSptoKTYa5iR2";

export async function POST(req: NextRequest) {
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

  // Success. Reset the lockout counters, and move an older, slower password
  // hash to the current cost - this is the one moment the plain password is
  // in hand, so it's the only chance to do it. Writes nothing in the common case.
  const upgradedHash = passwordNeedsRehash(user.passwordHash) ? await hashPassword(password) : null;
  const update = successfulLoginUpdate(user, upgradedHash);
  if (update) {
    await prisma.user.update({ where: { id: user.id }, data: update });
  }

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
