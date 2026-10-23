import test from "node:test";
import assert from "node:assert/strict";
import { classifyDriveHealth, tokenLifetimeDays } from "../src/lib/driveHealth";

const NOW = new Date("2026-10-20T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const base = { oauthConfigured: true, hasToken: true, needsReconnect: false, now: NOW, lifetimeDays: 7 };

test("nothing to prompt about when OAuth isn't configured", () => {
  const r = classifyDriveHealth({ ...base, oauthConfigured: false, hasToken: false, connectedAt: null });
  assert.equal(r.state, "unconfigured");
});

test("never connected -> disconnected", () => {
  const r = classifyDriveHealth({ ...base, hasToken: false, connectedAt: null });
  assert.equal(r.state, "disconnected");
});

test("token was found dead and cleared -> expired, until someone reconnects", () => {
  const r = classifyDriveHealth({ ...base, hasToken: false, needsReconnect: true, connectedAt: null });
  assert.equal(r.state, "expired");
});

test("a fresh connection is ok", () => {
  const r = classifyDriveHealth({ ...base, connectedAt: daysAgo(1) });
  assert.equal(r.state, "ok");
  assert.ok(r.daysLeft! > 5.9 && r.daysLeft! < 6.1);
  assert.equal(r.needsValidation, false);
});

test("still ok just before the warning window opens", () => {
  assert.equal(classifyDriveHealth({ ...base, connectedAt: daysAgo(5.9) }).state, "ok");
});

test("warns inside the last day, without bothering Google", () => {
  const r = classifyDriveHealth({ ...base, connectedAt: daysAgo(6.5) });
  assert.equal(r.state, "expiring");
  assert.ok(r.daysLeft! > 0.4 && r.daysLeft! < 0.6);
  assert.equal(r.needsValidation, false);
});

test("the warning window opens exactly one day before expiry", () => {
  assert.equal(classifyDriveHealth({ ...base, connectedAt: daysAgo(6) }).state, "expiring");
});

test("past the expected expiry it asks Google instead of guessing", () => {
  for (const age of [7, 7.2, 30]) {
    const r = classifyDriveHealth({ ...base, connectedAt: daysAgo(age) });
    assert.equal(r.needsValidation, true, `age ${age}`);
    assert.equal(r.daysLeft, 0);
  }
});

test("warning switched off (lifetime 0): never predicts an expiry", () => {
  const r = classifyDriveHealth({ ...base, lifetimeDays: 0, connectedAt: daysAgo(400) });
  assert.equal(r.state, "ok");
  assert.equal(r.needsValidation, false);
});

test("connections made before the date was recorded aren't second-guessed", () => {
  assert.equal(classifyDriveHealth({ ...base, connectedAt: null }).state, "ok");
});

test("a clock-skewed future date doesn't trigger a warning", () => {
  assert.equal(classifyDriveHealth({ ...base, connectedAt: daysAgo(-1) }).state, "ok");
});

test("tokenLifetimeDays parses the env var safely", () => {
  assert.equal(tokenLifetimeDays(undefined), 7);
  assert.equal(tokenLifetimeDays(""), 7);
  assert.equal(tokenLifetimeDays("  "), 7);
  assert.equal(tokenLifetimeDays("7"), 7);
  assert.equal(tokenLifetimeDays("14"), 14);
  assert.equal(tokenLifetimeDays("0"), 0);
  assert.equal(tokenLifetimeDays("abc"), 7);
  assert.equal(tokenLifetimeDays("-3"), 7);
});
