import crypto from "crypto";

// AES-256-GCM: a random 12-byte IV per encryption (never reused with the
// same key), the auth tag appended so tampering is detected on decrypt
// rather than silently producing garbage. Key comes from an env var the
// deploying admin controls - never hardcoded, never derived from anything
// guessable.
const ALGORITHM = "aes-256-gcm";

/** Thrown when no usable encryption key can be found - a configuration problem, not a bad token. */
export class MissingKeyError extends Error {
  constructor() {
    super("TOKEN_ENCRYPTION_KEY isn't set.");
    this.name = "MissingKeyError";
  }
}

function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY?.trim().replace(/^["']|["']$/g, "");
  if (raw) {
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) {
      throw new Error("TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (base64-encoded).");
    }
    return key;
  }
  // No dedicated key configured: derive one from SESSION_SECRET (HKDF with a
  // fixed purpose label, so the result is a different key from anything the
  // session code uses). This keeps Drive connecting even if the extra env
  // var was never added. An explicit TOKEN_ENCRYPTION_KEY always wins - and
  // switching between the two later just means reconnecting Drive once,
  // because tokens encrypted under one can't be read under the other.
  const master = process.env.SESSION_SECRET;
  if (master && master.length >= 32) {
    return Buffer.from(crypto.hkdfSync("sha256", master, "urban-beats-attendance", "drive-token-encryption-v1", 32));
  }
  throw new MissingKeyError();
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // iv : authTag : ciphertext, each base64, colon-joined - simple to store
  // as one TEXT column value.
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptSecret(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted value.");
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return decrypted.toString("utf8");
}
