import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidCronToken } from "@/lib/cronAuth";
import { runReconcile } from "@/lib/reconcileJob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Called every few minutes by the scheduled function. Not a public endpoint:
 * needs the token derived from SESSION_SECRET. Brings any out-of-date Drive
 * sheet up to date (see reconcileJob.ts).
 */
export async function POST(req: NextRequest) {
  if (!isValidCronToken(req.headers.get("authorization"), process.env.SESSION_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await prisma.appSetting.upsert({
    where: { key: "reconcileJobLastRunAt" },
    update: { value: new Date().toISOString() },
    create: { key: "reconcileJobLastRunAt", value: new Date().toISOString() },
  });
  const result = await runReconcile();
  return NextResponse.json({ ok: true, ...result });
}
