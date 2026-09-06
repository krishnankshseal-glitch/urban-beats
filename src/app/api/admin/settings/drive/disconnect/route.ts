import { NextResponse } from "next/server";
import { withRole } from "@/lib/apiGuard";
import { writeAuditLog } from "@/lib/audit";
import { disconnectDrive } from "@/lib/googleDrive";

export const runtime = "nodejs";

export async function POST() {
  return withRole("ADMIN", async (session) => {
    await disconnectDrive();
    await writeAuditLog({
      userId: session.userId,
      action: "DISCONNECT_DRIVE",
      entityType: "AppSetting",
      detail: "Disconnected the Google Drive account",
    });
    return NextResponse.json({ ok: true });
  });
}
