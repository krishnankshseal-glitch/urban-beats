import bcrypt from "bcryptjs";

/**
 * bcrypt work factor. 10 is bcrypt's standard default and meets current
 * guidance (OWASP: at least 10). It was 12, which in pure-JavaScript bcrypt on
 * a serverless function made every login and password change take a second
 * or more of pure computation; 10 is about four times faster. Existing hashes
 * stay valid and are upgraded to this cost the next time their owner logs in.
 */
export const PASSWORD_HASH_COST = 10;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, PASSWORD_HASH_COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** True for a hash made with a slower cost than we use now. */
export function passwordNeedsRehash(hash: string): boolean {
  try {
    return bcrypt.getRounds(hash) > PASSWORD_HASH_COST;
  } catch {
    return false;
  }
}
