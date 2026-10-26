import test from "node:test";
import assert from "node:assert/strict";
import { withRetry } from "../src/lib/retry";

const fast = { baseDelayMs: 1, maxDelayMs: 2 };
const httpError = (code: number) => Object.assign(new Error(`HTTP ${code}`), { code });

test("returns the result straight away when nothing fails", async () => {
  let calls = 0;
  const out = await withRetry(async () => { calls++; return "ok"; }, fast);
  assert.equal(out, "ok");
  assert.equal(calls, 1);
});

test("retries a 429 and succeeds on the third attempt", async () => {
  let calls = 0;
  const out = await withRetry(async () => {
    calls++;
    if (calls < 3) throw httpError(429);
    return "ok";
  }, fast);
  assert.equal(out, "ok");
  assert.equal(calls, 3);
});

test("retries 5xx errors, including status read from response.status", async () => {
  let calls = 0;
  const out = await withRetry(async () => {
    calls++;
    if (calls === 1) throw Object.assign(new Error("boom"), { response: { status: 503 } });
    if (calls === 2) throw httpError(500);
    return "ok";
  }, fast);
  assert.equal(out, "ok");
  assert.equal(calls, 3);
});

test("retries dropped connections", async () => {
  let calls = 0;
  const out = await withRetry(async () => {
    calls++;
    if (calls === 1) throw Object.assign(new Error("reset"), { code: "ECONNRESET" });
    return "ok";
  }, fast);
  assert.equal(out, "ok");
  assert.equal(calls, 2);
});

test("does not retry errors that retrying cannot fix", async () => {
  for (const code of [400, 401, 403, 404]) {
    let calls = 0;
    await assert.rejects(
      withRetry(async () => { calls++; throw httpError(code); }, fast),
      (e: any) => e.code === code
    );
    assert.equal(calls, 1, `status ${code} should not be retried`);
  }
});

test("gives up after the attempt cap and throws the last error", async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(async () => { calls++; throw httpError(500); }, fast),
    (e: any) => e.code === 500
  );
  assert.equal(calls, 4);
});

test("respects a custom attempt cap", async () => {
  let calls = 0;
  await assert.rejects(withRetry(async () => { calls++; throw httpError(429); }, { ...fast, maxAttempts: 2 }));
  assert.equal(calls, 2);
});
