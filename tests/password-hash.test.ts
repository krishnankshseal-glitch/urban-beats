import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { hashPassword, verifyPassword, passwordNeedsRehash, PASSWORD_HASH_COST } from "../src/lib/passwordHash";

test("new hashes use the current cost and verify correctly", async () => {
  const hash = await hashPassword("Correct-horse-9");
  assert.equal(bcrypt.getRounds(hash), PASSWORD_HASH_COST);
  assert.equal(await verifyPassword("Correct-horse-9", hash), true);
  assert.equal(await verifyPassword("wrong-password", hash), false);
});

test("old, slower hashes still verify, and are flagged for upgrade", async () => {
  const old = await bcrypt.hash("Legacy-pass-1", 12);
  assert.equal(await verifyPassword("Legacy-pass-1", old), true);
  assert.equal(passwordNeedsRehash(old), true);
});

test("hashes at the current cost are not flagged", async () => {
  assert.equal(passwordNeedsRehash(await hashPassword("x-Current-1")), false);
});

test("a malformed hash is not flagged and does not throw", () => {
  assert.equal(passwordNeedsRehash("not-a-bcrypt-hash"), false);
});

test("hashing is fast enough that a password change doesn't feel stuck", async () => {
  const t = Date.now();
  await hashPassword("Timing-check-1");
  assert.ok(Date.now() - t < 1000, `took ${Date.now() - t}ms`);
});
