import type { drive_v3 } from "googleapis";

export const FOLDER_MIME = "application/vnd.google-apps.folder";

type Drive = drive_v3.Drive;
/** Wraps a Google call, e.g. with retry. Defaults to calling it directly. */
export type Run = <T>(fn: () => Promise<T>) => Promise<T>;
const direct: Run = (fn) => fn();

/** Drive's search syntax needs backslashes and single quotes escaped inside a quoted literal. */
export function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export function isNotFoundError(err: unknown): boolean {
  const e = err as any;
  return e?.code === 404 || e?.response?.status === 404 || e?.status === 404;
}

/**
 * True when Google says this app can't use a given file/folder: it doesn't
 * exist, or it exists but this app has no access to it. With the drive.file
 * scope the second case is common - the app only ever sees what it created
 * itself, so a folder made earlier by a different identity (such as the old
 * service account) answers 404, or 403 appNotAuthorizedToFile.
 */
export function isInaccessibleError(err: unknown): boolean {
  if (isNotFoundError(err)) return true;
  const e = err as any;
  const status = e?.code ?? e?.response?.status;
  const reason = e?.errors?.[0]?.reason ?? e?.response?.data?.error?.errors?.[0]?.reason;
  return status === 403 && (reason === "appNotAuthorizedToFile" || reason === "insufficientFilePermissions");
}

/** Is a remembered folder ID still a live, usable folder for this connection? */
export async function folderIsUsable(drive: Drive, id: string, run: Run = direct): Promise<boolean> {
  try {
    const res = await run(() =>
      drive.files.get({ fileId: id, fields: "id, trashed, mimeType", supportsAllDrives: true })
    );
    return !res.data.trashed && res.data.mimeType === FOLDER_MIME;
  } catch (err) {
    if (isInaccessibleError(err)) return false;
    throw err;
  }
}

/** Every folder matching a Drive query, following all result pages. */
export async function findFolders(
  drive: Drive,
  query: string,
  run: Run = direct
): Promise<{ id?: string | null; name?: string | null }[]> {
  const results: { id?: string | null; name?: string | null }[] = [];
  let pageToken: string | undefined;
  do {
    const res = await run(() =>
      drive.files.list({
        q: query,
        fields: "nextPageToken, files(id, name)",
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      })
    );
    results.push(...(res.data.files ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return results;
}

/**
 * Returns a usable folder ID, healing whatever is stale:
 *  1. the remembered ID, if it still works;
 *  2. otherwise an existing folder with this name (inside parentId if given);
 *  3. otherwise a brand new one.
 * Callers persist the returned ID if it differs from what they remembered.
 */
export async function ensureFolder(
  drive: Drive,
  opts: { cachedId?: string | null; name: string; parentId?: string; run?: Run }
): Promise<string> {
  const run = opts.run ?? direct;
  if (opts.cachedId && (await folderIsUsable(drive, opts.cachedId, run))) return opts.cachedId;

  const parentClause = opts.parentId ? `'${escapeDriveQueryValue(opts.parentId)}' in parents and ` : "";
  const matches = await findFolders(
    drive,
    `${parentClause}name = '${escapeDriveQueryValue(opts.name)}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
    run
  );
  const found = matches[0]?.id;
  if (found) return found;

  const created = await run(() =>
    drive.files.create({
      requestBody: {
        name: opts.name,
        mimeType: FOLDER_MIME,
        ...(opts.parentId ? { parents: [opts.parentId] } : {}),
      },
      fields: "id",
      supportsAllDrives: true,
    })
  );
  if (!created.data.id) throw new Error("Google Drive didn't return an id for the new folder.");
  return created.data.id;
}
