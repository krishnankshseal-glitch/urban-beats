import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/apiGuard";

export const runtime = "nodejs";

export async function GET() {
  return withRole("ADMIN", async () => {
    const sessions = await prisma.session.findMany({
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        lastActiveAt: true,
        userAgent: true,
        user: { select: { username: true, role: true } },
      },
      orderBy: { lastActiveAt: "desc" },
    });
    return NextResponse.json({ sessions });
  });
}
