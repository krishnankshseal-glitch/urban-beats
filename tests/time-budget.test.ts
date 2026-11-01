import test from "node:test";
import assert from "node:assert/strict";
import { raceWithBudget } from "../src/lib/timeBudget";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("returns the work's result when it finishes within the budget", async () => {
  const out = await raceWithBudget(sleep(5).then(() => "done"), 500, () => "timed out");
  assert.equal(out, "done");
});

test("gives up at the budget and returns the fallback while the work carries on", async () => {
  let finished = false;
  const slow = sleep(150).then(() => { finished = true; return "done"; });
  const started = Date.now();
  const out = await raceWithBudget(slow, 20, () => "timed out");
  assert.equal(out, "timed out");
  assert.ok(Date.now() - started < 120, "should not have waited for the slow work");
  await slow; // the work itself still completes
  assert.equal(finished, true);
});

test("a work failure inside the budget still rejects", async () => {
  await assert.rejects(raceWithBudget(Promise.reject(new Error("boom")), 500, () => "x"), /boom/);
});

test("does not leave the timer running after an early finish", async () => {
  const started = Date.now();
  await raceWithBudget(Promise.resolve("fast"), 10_000, () => "x");
  // If the 10s timer were still pending the test runner would not exit for 10s; reaching here at once is the check.
  assert.ok(Date.now() - started < 200);
});
