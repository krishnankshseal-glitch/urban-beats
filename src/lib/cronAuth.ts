import { createHmac, timingSafeEqual } from "crypto";

/**
 * Purpose label mixed into the token, so the value is useless anywhere else.
 * The scheduled function (netlify/functions/reconcile-drive-sync.mts) carries
 * its own copy of this string so it can stay tiny; a test fails if they drift.
 */
export const CRON_TOKEN_LABEL = "urban-beats-reconcile-v1";

/**
 * The shared secret between the scheduled function and the app, derived from
 * SESSION_SECRET (which both already have), so nothing extra needs adding to
 * Netlify.
 */
export function cronToken(secret: string): string {
  return createHmac("sha256", secret).update(CRON_TOKEN_LABEL).digest("hex");
}

export function isValidCronToken(authorizationHeader: string | null | undefined, secret: string | undefined): boolean {
  if (!secret || !authorizationHeader || !authorizationHeader.startsWith("Bearer ")) return false;
  const given = Buffer.from(authorizationHeader.slice("Bearer ".length).trim());
  const expected = Buffer.from(cronToken(secret));
  return given.length === expected.length && timingSafeEqual(given, expected);
}
