import test from "node:test";
import assert from "node:assert/strict";
import { successfulLoginUpdate } from "../src/lib/loginSuccess";

const clean = { failedLoginAttempts: 0, lockedUntil: null };

test("a normal login on an up-to-date account writes nothing", () => {
  assert.equal(successfulLoginUpdate(clean, null), null);
});

test("failed attempts are reset after a successful login", () => {
  assert.deepEqual(successfulLoginUpdate({ failedLoginAttempts: 3, lockedUntil: null }, null), {
    failedLoginAttempts: 0,
    lockedUntil: null,
  });
});

test("an expired lock is cleared", () => {
  const r = successfulLoginUpdate({ failedLoginAttempts: 0, lockedUntil: new Date("2020-01-01") }, null);
  assert.deepEqual(r, { failedLoginAttempts: 0, lockedUntil: null });
});

test("an older, slower hash is replaced with the upgraded one", () => {
  assert.deepEqual(successfulLoginUpdate(clean, "$2a$10$newhash"), {
    failedLoginAttempts: 0,
    lockedUntil: null,
    passwordHash: "$2a$10$newhash",
  });
});

test("never touches the password hash when there is nothing to upgrade", () => {
  const r = successfulLoginUpdate({ failedLoginAttempts: 2, lockedUntil: null }, null);
  assert.ok(r && !("passwordHash" in r));
});
