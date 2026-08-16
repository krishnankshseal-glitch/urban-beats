import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { getDb } from "@/lib/db";
import { clearSessionCookie, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const prisma = getDb();
  const token = cookies().get(SESSION_COOKIE)?.value;

  if (token && process.env.SESSION_SECRET) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.SESSION_SECRET));
      if (payload.jti) {
        await prisma.session.update({
          where: { id: payload.jti as string },
          data: { revokedAt: new Date() },
        });
      }
    } catch {
      // token already invalid — nothing to revoke
    }
  }

  clearSessionCookie();
  return NextResponse.json({ ok: true });
}
