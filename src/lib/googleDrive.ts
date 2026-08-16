import { google } from "googleapis";
import { Readable } from "stream";
import { getDb } from "./db";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !rawKey) return null;
  // Vercel env vars store literal "\n" — convert back to real newlines for the PEM key.
  const key = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;
  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });
}

function getDrive() {
  const auth = getAuth();
  if (!auth) return null;
  return google.drive({ version: "v3", auth });
}

export function getServiceAccountEmail(): string | null {
  return process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? null;
}

export async function isDriveConfigured(): Promise<boolean> {
  const hasCreds = Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  );
  if (!hasCreds) return false;
  const rootId = await getRootFolderId();
  return Boolean(rootId);
}

export async function getRootFolderId(): Promise<string | null> {
  const setting = await prisma.appSetting.findUnique({ where: { key: "driveRootFolderId" } });
  return setting?.value ?? null;
}

export async function setRootFolderId(folderId: string) {
  const prisma = getDb();
  await prisma.appSetting.upsert({
    where: { key: "driveRootFolderId" },
    update: { value: folderId },
    create: { key: "driveRootFolderId", value: folderId },
  });
}

export async function testDriveConnection(
  folderId: string
): Promise<{ ok: boolean; message: string }> {
  const drive = getDrive();
  if (!drive) {
    return { ok: false, message: "Service account credentials aren't set as environment variables yet." };
  }
  try {
    const res = await drive.files.get({ fileId: folderId, fields: "id, name, mimeType" });
    if (res.data.mimeType !== FOLDER_MIME) {
      return { ok: false, message: "That ID points to a file, not a folder." };
    }
    return { ok: true, message: `Connected — found folder "${res.data.name}".` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      ok: false,
      message: `Couldn't access that folder (${message}). Double-check the folder ID and that it's shared with the service account as Editor.`,
    };
  }
}

/** Finds (or creates) the Drive subfolder for a class, inside the admin-configured root folder. */
export async function getOrCreateClassFolder(
  classId: string,
  className: string
): Promise<string | null> {
  const drive = getDrive();
  const rootId = await getRootFolderId();
  if (!drive || !rootId) return null;

  const existing = await prisma.class.findUnique({
    where: { id: classId },
    select: { driveFolderId: true },
  });
  if (existing?.driveFolderId) return existing.driveFolderId;

  const safeName = className.replace(/'/g, "\\'");
  const search = await drive.files.list({
    q: `'${rootId}' in parents and name = '${safeName}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: "files(id, name)",
  });
  let folderId = search.data.files?.[0]?.id;

  if (!folderId) {
  const prisma = getDb();
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
  const drive = getDrive();
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
  const drive = getDrive();
  if (!drive) throw new Error("Google Drive isn't configured.");

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
