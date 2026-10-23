import { NextResponse } from "next/server";
import { withRole } from "@/lib/apiGuard";
import { getDriveHealth } from "@/lib/googleDrive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return withRole("ADMIN", async () => {
    const health = await getDriveHealth();
    return NextResponse.json(health, { headers: { "Cache-Control": "no-store" } });
  });
}
