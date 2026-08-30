import { google } from "googleapis";
import { Readable } from "stream";
import { prisma } from "./db";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const ROOT_FOLDER_NAME = "Urban Beats Attendance";

const REFRESH_TOKEN_KEY = "driveOAuthRefreshToken";
const CONNECTED_EMAIL_KEY = "driveOAuthConnectedEmail";
const ROOT_FOLDER_ID_KEY = "driveRootFolderId";

// Deliberately just drive.file, not the full drive scope: it only ever
// touches files/folders the app itself creates (see getOrCreateRootFolder
// below - there's no "paste an existing folder ID" step anymore, on
// purpose). drive.file is classified non-sensitive by Google, so it never
// needs verification review, which is what keeps the OAuth consent screen
// eligible for "Production" status and refresh tokens that don't expire
// every 7 days. Using the broader `drive` scope here would silently trade
// that away. (This replaces the earlier service-account approach entirely
// - service accounts have zero Drive storage quota of their own and can't
// write file content into a personal, non-Workspace Google account.)
const SCOPES = ["https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/userinfo.email"];

function getOAuthClient() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!clientId || !clientSecret || !appUrl) return null;
  return new google.auth.OAuth2(clientId, clientSecret, `${appUrl.replace(/\/$/, "")}/api/admin/settings/drive/oauth/callback`);
}

export function isOAuthClientConfigured(): boolean {
  return getOAuthClient() !== null;
}

export function getOAuthConsentUrl(): string | null {
  const client = getOAuthClient();
  if (!client) return null;
  return client.generateAuthUrl({
    access_type: "offline", // required to get a refresh_token, not just a short-lived access_token
    prompt: "consent", // forces Google to issue a refresh_token even if this Google account has authorized before
    scope: SCOPES,
  });
}

export async function handleOAuthCallback(code: string): Promise<{ ok: boolean; message: string }> {
  const client = getOAuthClient();
  if (!client) return { ok: false, message: "Drive OAuth isn't configured (missing env vars)." };

  try {
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) {
      return {
        ok: false,
        message:
          "Google didn't return a refresh token this time. If you've connected before, remove this app from your Google Account's third-party access page first, then try connecting again.",
      };
    }
    client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const { data } = await oauth2.userinfo.get();
    const email = data.email ?? "unknown account";

    await prisma.appSetting.upsert({
      where: { key: REFRESH_TOKEN_KEY },
      update: { value: tokens.refresh_token },
      create: { key: REFRESH_TOKEN_KEY, value: tokens.refresh_token },
    });
    await prisma.appSetting.upsert({
      where: { key: CONNECTED_EMAIL_KEY },
      update: { value: email },
      create: { key: CONNECTED_EMAIL_KEY, value: email },
    });

    return { ok: true, message: `Connected as ${email}.` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, message: `Couldn't complete the connection (${message}).` };
  }
}

export async function disconnectDrive() {
  await prisma.appSetting.deleteMany({ where: { key: { in: [REFRESH_TOKEN_KEY, CONNECTED_EMAIL_KEY] } } });
}

export async function getConnectedAccountEmail(): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: CONNECTED_EMAIL_KEY } });
  return row?.value ?? null;
}

export async function isDriveConfigured(): Promise<boolean> {
  const row = await prisma.appSetting.findUnique({ where: { key: REFRESH_TOKEN_KEY } });
  return Boolean(row?.value);
}

async function getAuthorizedClient() {
  const client = getOAuthClient();
  if (!client) return null;
  const stored = await prisma.appSetting.findUnique({ where: { key: REFRESH_TOKEN_KEY } });
  if (!stored?.value) return null;
  // The googleapis client library handles minting + caching short-lived
  // access tokens from this refresh token internally on each call - no
  // manual token-refresh bookkeeping needed here, unlike the old JWT path.
  client.setCredentials({ refresh_token: stored.value });
  return client;
}

async function getDrive() {
  const auth = await getAuthorizedClient();
  if (!auth) return null;
  return google.drive({ version: "v3", auth });
}

async function getOrCreateRootFolder(): Promise<string | null> {
  const existing = await prisma.appSetting.findUnique({ where: { key: ROOT_FOLDER_ID_KEY } });
  if (existing?.value) return existing.value;

  const drive = await getDrive();
  if (!drive) return null;

  const created = await drive.files.create({
    requestBody: { name: ROOT_FOLDER_NAME, mimeType: FOLDER_MIME },
    fields: "id",
  });
  const folderId = created.data.id;
  if (!folderId) return null;

  await prisma.appSetting.upsert({
    where: { key: ROOT_FOLDER_ID_KEY },
    update: { value: folderId },
    create: { key: ROOT_FOLDER_ID_KEY, value: folderId },
  });
  return folderId;
}

export async function getRootFolderInfo(): Promise<{ id: string; webViewLink: string | null } | null> {
  const drive = await getDrive();
  if (!drive) return null;
  const rootId = await getOrCreateRootFolder();
  if (!rootId) return null;
  try {
    const res = await drive.files.get({ fileId: rootId, fields: "id, webViewLink" });
    return { id: rootId, webViewLink: res.data.webViewLink ?? null };
  } catch {
    return { id: rootId, webViewLink: null };
  }
}

export async function testDriveConnection(): Promise<{ ok: boolean; message: string }> {
  const drive = await getDrive();
  if (!drive) {
    return { ok: false, message: "Not connected to Google Drive yet." };
  }
  try {
    const rootId = await getOrCreateRootFolder();
    if (!rootId) return { ok: false, message: "Couldn't create the backup folder in your Drive." };
    await drive.files.get({ fileId: rootId, fields: "id, name" });
    return { ok: true, message: `Connected — backups go to "${ROOT_FOLDER_NAME}" in your Google Drive.` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, message: `Connected, but couldn't verify the backup folder (${message}).` };
  }
}

function escapeDriveQueryValue(value: string): string {
  // Drive's search query syntax needs both backslashes and single quotes
  // escaped inside a quoted string literal.
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Finds (or creates) the Drive subfolder for a class, inside the app's own backup root folder. */
export async function getOrCreateClassFolder(
  classId: string,
  className: string
): Promise<string | null> {
  const drive = await getDrive();
  const rootId = await getOrCreateRootFolder();
  if (!drive || !rootId) return null;

  const existing = await prisma.class.findUnique({
    where: { id: classId },
    select: { driveFolderId: true },
  });
  if (existing?.driveFolderId) return existing.driveFolderId;

  const safeName = escapeDriveQueryValue(className);
  const search = await drive.files.list({
    q: `'${rootId}' in parents and name = '${safeName}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: "files(id, name)",
  });
  let folderId = search.data.files?.[0]?.id;

  if (!folderId) {
    const created = await drive.files.create({
      requestBody: { name: className, mimeType: FOLDER_MIME, parents: [rootId] },
      fields: "id",
    });
    folderId = created.data.id ?? undefined;
  }

  if (folderId) {
    await prisma.class.update({ where: { id: classId }, data: { driveFolderId: folderId } });
  }
  return folderId ?? null;
}

/**
 * Finds (or creates) a year subfolder inside a class's Drive folder, so each
 * class ends up organized as: Root / [Class Name] / [Year] / month files.
 * Not DB-cached (unlike the class folder) since it's one cheap, scoped Drive
 * lookup and a class only has a handful of years across its lifetime.
 */
export async function getOrCreateYearFolder(
  classFolderId: string,
  year: number
): Promise<string | null> {
  const drive = await getDrive();
  if (!drive) return null;

  const yearName = String(year);
  const search = await drive.files.list({
    q: `'${classFolderId}' in parents and name = '${yearName}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: "files(id, name)",
  });
  let folderId = search.data.files?.[0]?.id;

  if (!folderId) {
    const created = await drive.files.create({
      requestBody: { name: yearName, mimeType: FOLDER_MIME, parents: [classFolderId] },
      fields: "id",
    });
    folderId = created.data.id ?? undefined;
  }

  return folderId ?? null;
}

/** Creates a new file, or overwrites an existing one in place if a fileId is given. */
export async function uploadOrReplaceSheet(params: {
  folderId: string;
  filename: string;
  buffer: Buffer;
  existingFileId?: string | null;
}): Promise<{ fileId: string; webViewLink: string | null }> {
  const drive = await getDrive();
  if (!drive) throw new Error("Google Drive isn't connected.");

  const media = { mimeType: XLSX_MIME, body: Readable.from(params.buffer) };

  if (params.existingFileId) {
    const res = await drive.files.update({
      fileId: params.existingFileId,
      media,
      fields: "id, webViewLink",
    });
    return { fileId: res.data.id as string, webViewLink: res.data.webViewLink ?? null };
  }

  const res = await drive.files.create({
    requestBody: { name: params.filename, parents: [params.folderId] },
    media,
    fields: "id, webViewLink",
  });
  return { fileId: res.data.id as string, webViewLink: res.data.webViewLink ?? null };
}
