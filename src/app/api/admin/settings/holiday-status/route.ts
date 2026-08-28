import { NextResponse } from "next/server";
import { withRole } from "@/lib/apiGuard";
import { getHolidayJobHeartbeat } from "@/lib/holidayDetection";

export async function GET() {
  return withRole("ADMIN", async () => {
    const heartbeatAt = await getHolidayJobHeartbeat();
    return NextResponse.json({ heartbeatAt });
  });
}
