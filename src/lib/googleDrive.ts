import { google } from "googleapis";
import { CodeChallengeMethod } from "google-auth-library";
import { Readable } from "stream";
import crypto from "crypto";
import { prisma } from "./db";
import { encryptSecret, decryptSecret, MissingKeyError } from "./crypto";
import { writeAuditLog } from "./audit";
import { withRetry } from "./retry";
import { ensureFolder, isInaccessibleError } from "./driveFolders";
import { classifyDriveHealth, tokenLifetimeDays, type DriveHealth } from "./driveHealth";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const ROOT_FOLDER_NAME = "Urban Beats Attendance";

const REFRESH_TOKEN_KEY = "driveOAuthRefreshToken";
const CONNECTED_EMAIL_KEY = "driveOAuthConnectedEmail";
const ROOT_FOLDER_ID_KEY = "driveRootFolderId";
const LAST_REFRESH_OK_KEY = "driveOAuthLastRefreshOkAt";
const CONNECTED_AT_KEY = "driveOAuthConnectedAt";
const NEEDS_RECONNECT_KEY = "driveNeedsReconnect";

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

    await prisma.appSetting.upsert({
      where: { key: CONNECTED_AT_KEY },
      update: { value: new Date().toISOString() },
      create: { key: CONNECTED_AT_KEY, value: new Date().toISOString() },
    });
    await prisma.appSetting.deleteMany({ where: { key: NEEDS_RECONNECT_KEY } });
    lastValidation = null;

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
  return code === "invalid_grant" || (typeof anyErr?.message === "string" && anyErr.message.includes("invalid_grant"));
}

/** Clears the stored connection - used both for an explicit Disconnect and
 * for auto-clearing when the credential is already known to be unusable, so
 * the UI shows "Connect Google Drive" again instead of a stale, permanently
 * broken "Connected as x" that can never actually work. The two automatic
 * cases are logged to AuditLog so a dead connection leaves a record findable
 * later, not just a UI state nobody happened to look at. */
async function clearStoredConnection(reason: "disconnect" | "dead_token" | "undecryptable") {
  await prisma.appSetting.deleteMany({
    where: {
      key: {
        in: [REFRESH_TOKEN_KEY, CONNECTED_EMAIL_KEY, ROOT_FOLDER_ID_KEY, LAST_REFRESH_OK_KEY, CONNECTED_AT_KEY],
      },
    },
  });
  lastValidation = null;
  if (reason === "disconnect") {
    // A deliberate disconnect isn't something to nag about.
    await prisma.appSetting.deleteMany({ where: { key: NEEDS_RECONNECT_KEY } });
    return;
  }
  // Remembered until someone reconnects, so the admin gets a reconnect prompt
  // instead of the connection silently looking like it was never set up.
  await prisma.appSetting.upsert({
    where: { key: NEEDS_RECONNECT_KEY },
    update: { value: "1" },
    create: { key: NEEDS_RECONNECT_KEY, value: "1" },
  });
  await writeAuditLog({
    userId: null,
    action: "DRIVE_CONNECTION_DIED",
    entityType: "AppSetting",
    detail:
      reason === "dead_token"
        ? "Google Drive connection was auto-disconnected after an invalid_grant error - it needs to be reconnected from Settings."
        : "The stored Google Drive credential couldn't be decrypted (the encryption key changed since it was saved) - it needs to be reconnected from Settings.",
  });
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

/** If a Google error means the stored credential is permanently dead, clear it
 * (so the reconnect prompt appears) and report that it was. */
export async function handleDriveAuthFailure(err: unknown): Promise<boolean> {
  if (!isDeadTokenError(err)) return false;
  await clearStoredConnection("dead_token");
  return true;
}

// Asking Google whether the token still works costs a network call, so the
// answer is reused for a few minutes (per server instance).
let lastValidation: { at: number; result: "valid" | "dead" | "unknown" } | null = null;
const VALIDATION_CACHE_MS = 10 * 60 * 1000;

async function validateRefreshToken(): Promise<"valid" | "dead" | "unknown"> {
  if (lastValidation && Date.now() - lastValidation.at < VALIDATION_CACHE_MS) return lastValidation.result;
  let result: "valid" | "dead" | "unknown";
  try {
    const client = await getAuthorizedClient();
    if (!client) {
      result = "dead";
    } else {
      await withRetry(() => client.getAccessToken());
      result = "valid";
    }
  } catch (err) {
    result = isDeadTokenError(err) ? "dead" : "unknown";
  }
  lastValidation = { at: Date.now(), result };
  return result;
}

/**
 * What the reconnect prompt should say. Cheap in the normal case (a database
 * read); only asks Google once the token is past its expected lifetime.
 */
export async function getDriveHealth(): Promise<DriveHealth> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: [REFRESH_TOKEN_KEY, CONNECTED_AT_KEY, NEEDS_RECONNECT_KEY] } },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const connectedAtRaw = byKey.get(CONNECTED_AT_KEY);
  const connectedAt = connectedAtRaw && !Number.isNaN(Date.parse(connectedAtRaw)) ? new Date(connectedAtRaw) : null;

  const c = classifyDriveHealth({
    oauthConfigured: isOAuthClientConfigured(),
    hasToken: Boolean(byKey.get(REFRESH_TOKEN_KEY)),
    needsReconnect: byKey.get(NEEDS_RECONNECT_KEY) === "1",
    connectedAt,
    now: new Date(),
    lifetimeDays: tokenLifetimeDays(process.env.DRIVE_TOKEN_LIFETIME_DAYS),
  });
  if (!c.needsValidation) return { state: c.state, daysLeft: c.daysLeft };

  const verdict = await validateRefreshToken();
  if (verdict === "valid") return { state: "ok", daysLeft: null };
  if (verdict === "dead") {
    if (await isDriveConfigured()) await clearStoredConnection("dead_token");
    return { state: "expired", daysLeft: 0 };
  }
  return { state: "expiring", daysLeft: 0 };
}

async function getAuthorizedClient() {
  const client = getOAuthClient();
  if (!client) return null;
  const stored = await prisma.appSetting.findUnique({ where: { key: REFRESH_TOKEN_KEY } });
  if (!stored?.value) return null;

  let refreshToken: string;
  try {
    refreshToken = decryptSecret(stored.value);
  } catch (err) {
    // A missing key is a configuration problem - fail loudly and keep the
    // token, which is probably fine once the key is back. Anything else
    // means the credential can never be read again (the key changed, or the
    // data is damaged), so treat it as a dead connection and ask to reconnect.
    if (err instanceof MissingKeyError) throw err;
    await clearStoredConnection("undecryptable");
    return null;
  }
  // The googleapis client library handles minting + caching short-lived
  // access tokens from this refresh token internally on each call - no
  // manual token-refresh bookkeeping needed here, unlike the old JWT path.
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

async function getDrive() {
  const auth = await getAuthorizedClient();
  if (!auth) return null;
  return google.drive({ version: "v3", auth, timeout: API_TIMEOUT_MS });
}

/**
 * The app's own backup folder. The remembered ID is only trusted if it still
 * works for this connection: an ID left over from the old service-account
 * setup (or a folder that was deleted, or a different Google account) answers
 * "not found" under drive.file, so we look for our own folder by name and
 * only create a new one if there really isn't one.
 */
async function getOrCreateRootFolder(): Promise<string | null> {
  const drive = await getDrive();
  if (!drive) return null;
  const stored = await prisma.appSetting.findUnique({ where: { key: ROOT_FOLDER_ID_KEY } });
  const id = await ensureFolder(drive, { cachedId: stored?.value, name: ROOT_FOLDER_NAME, run: withRetry });
  if (id !== stored?.value) {
    await prisma.appSetting.upsert({
      where: { key: ROOT_FOLDER_ID_KEY },
      update: { value: id },
      create: { key: ROOT_FOLDER_ID_KEY, value: id },
    });
  }
  return id;
}

export async function getRootFolderInfo(): Promise<{ id: string; webViewLink: string | null } | null> {
  try {
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
  } catch {
    return null;
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
  try {
    const drive = await getDrive();
    if (!drive) {
      return { ok: false, message: "Not connected to Google Drive yet." };
    }
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
  // The remembered folder is verified, not assumed: if it's gone or this
  // connection can't see it, a fresh one is found/created and remembered.
  const folderId = await ensureFolder(drive, {
    cachedId: existing?.driveFolderId,
    name: className,
    parentId: rootId,
    run: withRetry,
  });
  if (folderId !== existing?.driveFolderId) {
    await prisma.class.update({ where: { id: classId }, data: { driveFolderId: folderId } });
  }
  return folderId;
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
  return ensureFolder(drive, { name: String(year), parentId: classFolderId, run: withRetry });
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
    try {
      const res = await withRetry(() =>
        drive.files.update({
          fileId: params.existingFileId as string,
          media: { mimeType: XLSX_MIME, body: Readable.from(params.buffer) },
          fields: "id, webViewLink",
          supportsAllDrives: true,
        })
      );
      return { fileId: res.data.id as string, webViewLink: res.data.webViewLink ?? null };
    } catch (err) {
      // The remembered file is gone, or belongs to a connection this app can
      // no longer see (an earlier Google account or setup) - fall through and
      // write a fresh copy instead of failing every future sync.
      if (!isInaccessibleError(err)) throw err;
    }
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
