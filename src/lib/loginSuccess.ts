/**
 * What to write to the user's row after a successful login, or null if there is
 * nothing to write (the common case, so a normal login costs no extra write).
 * Resets the failed-attempt counters if they were non-zero, and swaps in a
 * hash made at the current cost if the stored one is an older, slower one.
 */
export function successfulLoginUpdate(
  user: { failedLoginAttempts: number; lockedUntil: Date | null },
  upgradedHash: string | null
): { failedLoginAttempts: 0; lockedUntil: null; passwordHash?: string } | null {
  if (!upgradedHash && user.failedLoginAttempts === 0 && !user.lockedUntil) return null;
  return {
    failedLoginAttempts: 0,
    lockedUntil: null,
    ...(upgradedHash ? { passwordHash: upgradedHash } : {}),
  };
}
