import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import crypto from "crypto";
import { prisma } from "./db";
import type { Role } from "@prisma/client";

export const SESSION_COOKIE = "ub_session";
// Sessions are sliding (refreshed on activity) so a teacher who opens the
// app regularly effectively never has to log in again, while an idle
// session still expires eventually and can always be force-revoked by an admin.
const SESSION_TTL_DAYS = 45;

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET is missing or too short. Set a long random value (see .env.example)."
    );
  }
  return new TextEncoder().encode(secret);
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// ---------- Passwords ----------

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

// ---------- Sessions ----------

export type SessionUser = {
  userId: string;
  role: Role;
  username: string;
  sessionId: string;
};

/**
 * Creates a DB-backed session row + a signed JWT that references it.
 * The JWT alone proves possession of a validly-signed token; the DB row
 * is the source of truth for whether that token is still allowed to be used
 * (so an admin can instantly force-logout any device).
 */
export async function createSession(params: {
  userId: string;
  role: Role;
  userAgent?: string | null;
  ipAddress?: string | null;
}) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  const session = await prisma.session.create({
    data: {
      userId: params.userId,
      tokenHash: "pending",
      userAgent: params.userAgent ?? undefined,
      ipAddress: params.ipAddress ?? undefined,
      expiresAt,
    },
  });

  const token = await new SignJWT({ role: params.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(params.userId)
    .setJti(session.id)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(getSecretKey());

  await prisma.session.update({
    where: { id: session.id },
    data: { tokenHash: hashToken(token) },
  });

  return { token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie() {
  cookies().set(SESSION_COOKIE, "", { path: "/", expires: new Date(0) });
}

/**
 * Authoritative session check: verifies the JWT signature AND confirms
 * the underlying DB session row still exists, is unrevoked, unexpired,
 * and belongs to a still-active user. Use this in every API route and
 * server component that touches real data — never trust the JWT alone.
 */
export async function getSession(): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  let payload;
  try {
    const result = await jwtVerify(token, getSecretKey());
    payload = result.payload;
  } catch {
    return null; // bad signature, tampered, or expired
  }

  const sessionId = payload.jti;
  const userId = payload.sub;
  if (!sessionId || !userId) return null;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });

  if (
    !session ||
    session.revokedAt ||
    session.expiresAt < new Date() ||
    session.tokenHash !== hashToken(token) ||
    !session.user.isActive
  ) {
    return null;
  }

  // Sliding expiration: bump lastActiveAt so "currently logged in" is accurate.
  await prisma.session.update({
    where: { id: session.id },
    data: { lastActiveAt: new Date() },
  });

  return {
    userId: session.user.id,
    role: session.user.role,
    username: session.user.username,
    sessionId: session.id,
  };
}

export async function revokeSession(sessionId: string) {
  await prisma.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });
}

export async function requireRole(role: Role): Promise<SessionUser> {
  const session = await getSession();
  if (!session || session.role !== role) {
    throw new AuthError(session ? "FORBIDDEN" : "UNAUTHENTICATED");
  }
  return session;
}

export class AuthError extends Error {
  code: "UNAUTHENTICATED" | "FORBIDDEN";
  constructor(code: "UNAUTHENTICATED" | "FORBIDDEN") {
    super(code);
    this.code = code;
  }
}
