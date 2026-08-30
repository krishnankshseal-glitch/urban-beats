import { NextResponse } from "next/server";
import { withRole } from "@/lib/apiGuard";
import { isDriveConfigured, getConnectedAccountEmail, getRootFolderInfo, testDriveConnection, isOAuthClientConfigured } from "@/lib/googleDrive";

export const runtime = "nodejs";

export async function GET() {
  return withRole("ADMIN", async () => {
    const [connected, oauthConfigured] = await Promise.all([isDriveConfigured(), isOAuthClientConfigured()]);

    if (!connected) {
      return NextResponse.json({ connected: false, oauthConfigured, connectedEmail: null, rootFolder: null, connection: null });
    }

    const [connectedEmail, rootFolder, connection] = await Promise.all([
      getConnectedAccountEmail(),
      getRootFolderInfo(),
      testDriveConnection(),
    ]);

    return NextResponse.json({ connected: true, oauthConfigured, connectedEmail, rootFolder, connection });
  });
}
