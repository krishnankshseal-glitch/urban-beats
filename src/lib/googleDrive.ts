import { google } from "googleapis";
import { CodeChallengeMethod } from "google-auth-library";
import { Readable } from "stream";
import crypto from "crypto";
import { prisma } from "./db";
import { encryptSecret, decryptSecret } from "./crypto";
import { writeAuditLog } from "./audit";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const ROOT_FOLDER_NAME = "Urban Beats Attendance";

const REFRESH_TOKEN_KEY = "driveOAuthRefreshToken";
const CONNECTED_EMAIL_KEY = "driveOAuthConnectedEmail";
const ROOT_FOLDER_ID_KEY = "driveRootFolderId";
const LAST_REFRESH_OK_KEY = "driveOAuthLastRefreshOkAt";

// Deliberately just drive.file, not the full drive scope: it only ever
// touches files/folders the app itself creates (see getOrCreateRootFolder
// below - there's no "paste an existing folder ID" step anymore, on
// purpose). drive.file is classified non-sensitive by Google, so it never
// needs verification review, which is what keeps the OAuth consent screen
// eligible for "Production" status and refresh tokens that don't expire
// every 7 days. Using the broader `drive` scope here would silently trade
// that away.
const SCOPES = ["https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/userinfo.email"];

const API_TIMEOUT_MS = 15000;

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

/** PKCE pair for the authorization request. code_verifier is kept only in a
 * short-lived cookie by the caller and sent back on token exchange; Google
 * never sees anything but the derived challenge until then. Defense-in-depth
 * on top of the client_secret - not required for this client type, but
 * current OAuth guidance treats it as worth having anyway. */
export function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function getOAuthConsentUrl(state: string, codeChallenge: string): string | null {
  const client = getOAuthClient();
  if (!client) return null;
  return client.generateAuthUrl({
    access_type: "offline", // required to get a refresh_token, not just a short-lived access_token
    prompt: "consent", // forces Google to issue a refresh_token even if this Google account has authorized before
    scope: SCOPES,
    state, // CSRF protection - the callback route checks this against a signed cookie
    code_challenge: codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
  });
}

// Truncated exponential backoff with jitter, per Google's own documented
// retry guidance for its APIs - not a fixed-delay or immediate retry, and
// capped at a sane attempt count so a persistent failure still surfaces
// instead of hanging indefinitely.
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const anyErr = err as any;
      const status = anyErr?.code ?? anyErr?.response?.status;
      const retryable = status === 429 || (typeof status === "number" && status >= 500);
      if (!retryable || attempt === maxAttempts - 1) throw err;
      const baseDelayMs = Math.min(1000 * 2 ** attempt, 8000);
      const jitterMs = Math.random() * baseDelayMs * 0.5;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs + jitterMs));
    }
  }
  throw lastErr;
}

export async function handleOAuthCallback(code: string, codeVerifier: string): Promise<{ ok: boolean; message: string }> {
  const client = getOAuthClient();
  if (!client) return { ok: false, message: "Drive OAuth isn't configured (missing env vars)." };

  try {
    const { tokens } = await withRetry(() => client.getToken({ code, codeVerifier }));
    if (!tokens.refresh_token) {
      return {
        ok: false,
        message:
          "Google didn't return a refresh token this time. If you've connected before, remove this app from your Google Account's third-party access page first, then try connecting again.",
      };
    }
    client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const { data } = await withRetry(() => oauth2.userinfo.get());
    const email = data.email ?? "unknown account";

    await prisma.appSetting.upsert({
      where: { key: REFRESH_TOKEN_KEY },
      update: { value: encryptSecret(tokens.refresh_token) },
      create: { key: REFRESH_TOKEN_KEY, value: encryptSecret(tokens.refresh_token) },
    });
    await prisma.appSetting.upsert({
      where: { key: CONNECTED_EMAIL_KEY },
      update: { value: email },
      create: { key: CONNECTED_EMAIL_KEY, value: email },
    });
    await prisma.appSetting.upsert({
      where: { key: LAST_REFRESH_OK_KEY },
      update: { value: new Date().toISOString() },
      create: { key: LAST_REFRESH_OK_KEY, value: new Date().toISOString() },
    });

    return { ok: true, message: `Connected as ${email}.` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, message: `Couldn't complete the connection (${message}).` };
  }
}

/** True if a Google API error indicates the refresh token is permanently dead
 * (revoked, expired from disuse, password change, etc.) rather than a
 * transient failure - these all show up as invalid_grant from Google. */
function isDeadTokenError(err: unknown): boolean {
  const anyErr = err as any;
  const code = anyErr?.response?.data?.error ?? anyErr?.code;
  return code === "invalid_grant";
}

/** Clears the stored connection - used both for an explicit Disconnect and
 * for auto-clearing when a Drive call reveals the token is already dead, so
 * the UI shows "Connect Google Drive" again instead of a stale, permanently
 * broken "Connected as x" that can never actually work. Logs the auto-clear
 * case to AuditLog specifically so a dead connection leaves a record findable
 * later, not just a UI state nobody happened to look at. */
async function clearStoredConnection(reason: "disconnect" | "dead_token") {
  await prisma.appSetting.deleteMany({
    where: { key: { in: [REFRESH_TOKEN_KEY, CONNECTED_EMAIL_KEY, ROOT_FOLDER_ID_KEY, LAST_REFRESH_OK_KEY] } },
  });
  if (reason === "dead_token") {
    await writeAuditLog({
      userId: null,
      action: "DRIVE_CONNECTION_DIED",
      entityType: "AppSetting",
      detail: "Google Drive connection was auto-disconnected after an invalid_grant error - it needs to be reconnected from Settings.",
    });
  }
}

export async function disconnectDrive() {
  const stored = await prisma.appSetting.findUnique({ where: { key: REFRESH_TOKEN_KEY } });
  if (stored?.value) {
    try {
      const client = getOAuthClient();
      if (client) {
        // Actually revoke the grant on Google's side, not just forget it
        // locally - otherwise it stays listed as active access on the
        // user's own Google Account until they separately revoke it there.
        await withRetry(() => client.revokeToken(decryptSecret(stored.value)));
      }
    } catch {
      // If revoke fails (token already dead, network hiccup), still clear
      // our own record - a failed revoke shouldn't block disconnecting here.
    }
  }
  await clearStoredConnection("disconnect");
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
  client.setCredentials({ refresh_token: decryptSecret(stored.value) });
  return client;
}

async function getDrive() {
  const auth = await getAuthorizedClient();
  if (!auth) return null;
  return google.drive({ version: "v3", auth, timeout: API_TIMEOUT_MS });
}

async function getOrCreateRootFolder(): Promise<string | null> {
  const existing = await prisma.appSetting.findUnique({ where: { key: ROOT_FOLDER_ID_KEY } });
  if (existing?.value) return existing.value;

  const drive = await getDrive();
  if (!drive) return null;

  const created = await withRetry(() =>
    drive.files.create({
      requestBody: { name: ROOT_FOLDER_NAME, mimeType: FOLDER_MIME },
      fields: "id",
      supportsAllDrives: true,
    })
  );
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
    const res = await withRetry(() =>
      drive.files.get({ fileId: rootId, fields: "id, webViewLink", supportsAllDrives: true })
    );
    return { id: rootId, webViewLink: res.data.webViewLink ?? null };
  } catch {
    return { id: rootId, webViewLink: null };
  }
}

/** Turns a Drive/Google API error into a message that actually says what to
 * do next, instead of one generic string for every failure. */
function describeGoogleError(err: unknown): string {
  const anyErr = err as any;
  const reason = anyErr?.errors?.[0]?.reason ?? anyErr?.response?.data?.error?.errors?.[0]?.reason;
  const status = anyErr?.code ?? anyErr?.response?.status;

  if (reason === "storageQuotaExceeded") return "The connected Google account is out of storage space.";
  if (reason === "insufficientPermissions") return "This Google account doesn't have permission for that action.";
  if (reason === "userRateLimitExceeded" || reason === "rateLimitExceeded")
    return "Hit Google's rate limit - this should resolve itself shortly.";
  if (status === 404) return "That file or folder no longer exists in Drive.";
  return err instanceof Error ? err.message : "Unknown error";
}

export async function testDriveConnection(): Promise<{ ok: boolean; message: string }> {
  const drive = await getDrive();
  if (!drive) {
    return { ok: false, message: "Not connected to Google Drive yet." };
  }
  try {
    const rootId = await getOrCreateRootFolder();
    if (!rootId) return { ok: false, message: "Couldn't create the backup folder in your Drive." };
    await withRetry(() => drive.files.get({ fileId: rootId, fields: "id, name", supportsAllDrives: true }));
    await prisma.appSetting.upsert({
      where: { key: LAST_REFRESH_OK_KEY },
      update: { value: new Date().toISOString() },
      create: { key: LAST_REFRESH_OK_KEY, value: new Date().toISOString() },
    });
    return { ok: true, message: `Connected — backups go to "${ROOT_FOLDER_NAME}" in your Google Drive.` };
  } catch (err) {
    if (isDeadTokenError(err)) {
      // The token is permanently dead (revoked, expired from disuse, etc.) -
      // clear it so the UI offers "Connect" again instead of showing a
      // "connected" state that will never succeed no matter how many times
      // it's retried.
      await clearStoredConnection("dead_token");
      return { ok: false, message: "Your Google connection was revoked or expired - reconnect below." };
    }
    return { ok: false, message: `Connected, but couldn't verify the backup folder (${describeGoogleError(err)}).` };
  }
}

function escapeDriveQueryValue(value: string): string {
  // Drive's search query syntax needs both backslashes and single quotes
  // escaped inside a quoted string literal.
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Runs a Drive files.list search across every page of results - a folder
 * lookup here should only ever match 0-1 items in practice, but this stops
 * that assumption from silently becoming a bug if it's ever wrong. */
async function findAllMatchingFiles(
  drive: ReturnType<typeof google.drive>,
  query: string
): Promise<{ id?: string | null; name?: string | null }[]> {
  const results: { id?: string | null; name?: string | null }[] = [];
  let pageToken: string | undefined;
  do {
    const res = await withRetry(() =>
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
  const matches = await findAllMatchingFiles(
    drive,
    `'${rootId}' in parents and name = '${safeName}' and mimeType = '${FOLDER_MIME}' and trashed = false`
  );
  let folderId = matches[0]?.id;

  if (!folderId) {
    const created = await withRetry(() =>
      drive.files.create({
        requestBody: { name: className, mimeType: FOLDER_MIME, parents: [rootId] },
        fields: "id",
        supportsAllDrives: true,
      })
    );
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
  const matches = await findAllMatchingFiles(
    drive,
    `'${classFolderId}' in parents and name = '${yearName}' and mimeType = '${FOLDER_MIME}' and trashed = false`
  );
  let folderId = matches[0]?.id;

  if (!folderId) {
    const created = await withRetry(() =>
      drive.files.create({
        requestBody: { name: yearName, mimeType: FOLDER_MIME, parents: [classFolderId] },
        fields: "id",
        supportsAllDrives: true,
      })
    );
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

  if (params.existingFileId) {
    const res = await withRetry(() =>
      drive.files.update({
        fileId: params.existingFileId as string,
        media: { mimeType: XLSX_MIME, body: Readable.from(params.buffer) },
        fields: "id, webViewLink",
        supportsAllDrives: true,
      })
    );
    return { fileId: res.data.id as string, webViewLink: res.data.webViewLink ?? null };
  }

  const res = await withRetry(() =>
    drive.files.create({
      requestBody: { name: params.filename, parents: [params.folderId] },
      media: { mimeType: XLSX_MIME, body: Readable.from(params.buffer) },
      fields: "id, webViewLink",
      supportsAllDrives: true,
    })
  );
  return { fileId: res.data.id as string, webViewLink: res.data.webViewLink ?? null };
}
