import { NextResponse } from "next/server";
import { withRole } from "@/lib/apiGuard";
import { getPurgeJobHeartbeat } from "@/lib/attendancePurge";
import { prisma } from "@/lib/db";

export async function GET() {
  return withRole("ADMIN", async () => {
    const [heartbeatAt, lastRun] = await Promise.all([
      getPurgeJobHeartbeat(),
      prisma.appSetting.findUnique({ where: { key: "purgeJobLastRunMonth" } }),
    ]);
    return NextResponse.json({ heartbeatAt, lastRunMonth: lastRun?.value ?? null });
  });
}
