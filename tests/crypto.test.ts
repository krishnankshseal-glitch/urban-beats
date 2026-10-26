import test from "node:test";
import assert from "node:assert/strict";
import { encryptSecret, decryptSecret, MissingKeyError } from "../src/lib/crypto";

const KEY_A = Buffer.alloc(32, 1).toString("base64");
const KEY_B = Buffer.alloc(32, 2).toString("base64");
const SESSION = "s".repeat(48);

function withEnv<T>(env: Record<string, string | undefined>, fn: () => T): T {
  const saved = { TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY, SESSION_SECRET: process.env.SESSION_SECRET };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("round-trips with an explicit key", () => {
  withEnv({ TOKEN_ENCRYPTION_KEY: KEY_A, SESSION_SECRET: undefined }, () => {
    const sealed = encryptSecret("1//refresh-token-value");
    assert.notEqual(sealed, "1//refresh-token-value");
    assert.equal(decryptSecret(sealed), "1//refresh-token-value");
  });
});

test("the same text encrypts differently every time (random IV)", () => {
  withEnv({ TOKEN_ENCRYPTION_KEY: KEY_A }, () => {
    assert.notEqual(encryptSecret("same"), encryptSecret("same"));
  });
});

test("with no dedicated key it derives one from SESSION_SECRET and still round-trips", () => {
  withEnv({ TOKEN_ENCRYPTION_KEY: undefined, SESSION_SECRET: SESSION }, () => {
    const sealed = encryptSecret("token");
    assert.equal(decryptSecret(sealed), "token");
  });
});

test("an explicit key takes precedence over the derived one", () => {
  const derived = withEnv({ TOKEN_ENCRYPTION_KEY: undefined, SESSION_SECRET: SESSION }, () => encryptSecret("token"));
  withEnv({ TOKEN_ENCRYPTION_KEY: KEY_A, SESSION_SECRET: SESSION }, () => {
    assert.throws(() => decryptSecret(derived));
  });
});

test("a different key cannot read the data", () => {
  const sealed = withEnv({ TOKEN_ENCRYPTION_KEY: KEY_A }, () => encryptSecret("token"));
  withEnv({ TOKEN_ENCRYPTION_KEY: KEY_B }, () => {
    assert.throws(() => decryptSecret(sealed));
  });
});

test("tampered ciphertext is rejected", () => {
  withEnv({ TOKEN_ENCRYPTION_KEY: KEY_A }, () => {
    const sealed = encryptSecret("token-to-protect");
    const mid = Math.floor(sealed.length / 2);
    const tampered = sealed.slice(0, mid) + (sealed[mid] === "A" ? "B" : "A") + sealed.slice(mid + 1);
    assert.throws(() => decryptSecret(tampered));
  });
});

test("a missing key is reported as MissingKeyError, distinct from an unreadable token", () => {
  withEnv({ TOKEN_ENCRYPTION_KEY: undefined, SESSION_SECRET: undefined }, () => {
    assert.throws(() => encryptSecret("x"), (e: unknown) => e instanceof MissingKeyError && /isn't set/.test((e as Error).message));
  });
  withEnv({ TOKEN_ENCRYPTION_KEY: undefined, SESSION_SECRET: "too-short" }, () => {
    assert.throws(() => encryptSecret("x"), (e: unknown) => e instanceof MissingKeyError);
  });
  const sealed = withEnv({ TOKEN_ENCRYPTION_KEY: KEY_A }, () => encryptSecret("x"));
  withEnv({ TOKEN_ENCRYPTION_KEY: KEY_B }, () => {
    assert.throws(() => decryptSecret(sealed), (e: unknown) => !(e instanceof MissingKeyError));
  });
});

test("rejects a key of the wrong length", () => {
  withEnv({ TOKEN_ENCRYPTION_KEY: Buffer.alloc(16, 1).toString("base64") }, () => {
    assert.throws(() => encryptSecret("x"), /32 bytes/);
  });
});

test("tolerates stray whitespace and quotes pasted around the key", () => {
  const sealed = withEnv({ TOKEN_ENCRYPTION_KEY: KEY_A }, () => encryptSecret("token"));
  withEnv({ TOKEN_ENCRYPTION_KEY: `  "${KEY_A}"\n` }, () => {
    assert.equal(decryptSecret(sealed), "token");
  });
});
