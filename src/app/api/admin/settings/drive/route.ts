import { NextRequest, NextResponse } from "next/server";
import { withRole } from "@/lib/apiGuard";
import { writeAuditLog } from "@/lib/audit";
import { driveSettingsSchema } from "@/lib/schemas";
import {
  getRootFolderId,
  getServiceAccountEmail,
  setRootFolderId,
  testDriveConnection,
} from "@/lib/googleDrive";

export const runtime = "nodejs";

export async function GET() {
  return withRole("ADMIN", async () => {
    const [rootFolderId] = await Promise.all([getRootFolderId()]);
    const serviceAccountEmail = getServiceAccountEmail();
    const credentialsConfigured = Boolean(
      serviceAccountEmail && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
    );

    let connection: { ok: boolean; message: string } | null = null;
    if (rootFolderId && credentialsConfigured) {
      connection = await testDriveConnection(rootFolderId);
    }

    return NextResponse.json({
      serviceAccountEmail,
      credentialsConfigured,
      rootFolderId,
      connection,
    });
  });
}

export async function POST(req: NextRequest) {
  return withRole("ADMIN", async (session) => {
    const parsed = driveSettingsSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Paste a valid Drive folder ID." }, { status: 400 });
    }

    const result = await testDriveConnection(parsed.data.folderId);
    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    await setRootFolderId(parsed.data.folderId);
    await writeAuditLog({
      userId: session.userId,
      action: "UPDATE_DRIVE_SETTINGS",
      entityType: "AppSetting",
      detail: "Set the Google Drive root folder",
    });

    return NextResponse.json({ ok: true, message: result.message });
  });
}
