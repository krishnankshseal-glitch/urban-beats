export type DriveHealthState = "ok" | "expiring" | "expired" | "disconnected" | "unconfigured";
export type DriveHealth = { state: DriveHealthState; daysLeft: number | null };

/**
 * While the Google OAuth consent screen is in "Testing" status, Google
 * expires every refresh token after exactly 7 days - and a free *.netlify.app
 * domain can't complete Google's domain verification, so Testing is where
 * this app stays. If the app is ever published (or the domain verified),
 * set DRIVE_TOKEN_LIFETIME_DAYS=0 to switch the advance warning off; the
 * reconnect prompt still appears the moment Google actually rejects the token.
 */
export const DEFAULT_TOKEN_LIFETIME_DAYS = 7;
/** Start nagging this many days before the expected expiry. */
export const WARN_WITHIN_DAYS = 1;
const DAY_MS = 86_400_000;

export function tokenLifetimeDays(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_TOKEN_LIFETIME_DAYS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_TOKEN_LIFETIME_DAYS;
}

export function classifyDriveHealth(input: {
  oauthConfigured: boolean;
  hasToken: boolean;
  /** Set when a stored token was found dead and cleared, until someone reconnects. */
  needsReconnect: boolean;
  connectedAt: Date | null;
  now: Date;
  lifetimeDays: number;
}): { state: DriveHealthState; daysLeft: number | null; needsValidation: boolean } {
  if (!input.oauthConfigured) return { state: "unconfigured", daysLeft: null, needsValidation: false };
  if (!input.hasToken) {
    return { state: input.needsReconnect ? "expired" : "disconnected", daysLeft: null, needsValidation: false };
  }
  // No way to predict an expiry: warning switched off, or connected before we recorded when.
  if (input.lifetimeDays === 0 || !input.connectedAt) return { state: "ok", daysLeft: null, needsValidation: false };

  const ageDays = (input.now.getTime() - input.connectedAt.getTime()) / DAY_MS;
  const daysLeft = input.lifetimeDays - ageDays;
  // Past the expected expiry the token is probably dead - but only Google knows, so ask it.
  if (daysLeft <= 0) return { state: "expiring", daysLeft: 0, needsValidation: true };
  if (daysLeft <= WARN_WITHIN_DAYS) return { state: "expiring", daysLeft, needsValidation: false };
  return { state: "ok", daysLeft, needsValidation: false };
}
