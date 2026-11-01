import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cronToken, isValidCronToken, CRON_TOKEN_LABEL } from "../src/lib/cronAuth";
import { planReconcile, whyOutOfDate } from "../src/lib/reconcile";
import type { ClassMonth, SheetState } from "../src/lib/purgeEngine";
import type { SheetRow } from "../src/lib/reconcile";

const SECRET = "x".repeat(48);

test("a correct token is accepted", () => {
  assert.equal(isValidCronToken(`Bearer ${cronToken(SECRET)}`, SECRET), true);
});

test("wrong, missing, malformed or secret-less requests are refused", () => {
  assert.equal(isValidCronToken(`Bearer ${cronToken("another-secret-" + "y".repeat(40))}`, SECRET), false);
  assert.equal(isValidCronToken("Bearer nonsense", SECRET), false);
  assert.equal(isValidCronToken(cronToken(SECRET), SECRET), false); // no "Bearer "
  assert.equal(isValidCronToken(null, SECRET), false);
  assert.equal(isValidCronToken(`Bearer ${cronToken(SECRET)}`, undefined), false);
  assert.equal(isValidCronToken(`Bearer ${cronToken(SECRET)}`, ""), false);
});

test("the scheduled function builds its token with the same label as the app", () => {
  const src = readFileSync(new URL("../netlify/functions/reconcile-drive-sync.mts", import.meta.url), "utf8");
  assert.ok(src.includes(`"${CRON_TOKEN_LABEL}"`), "label in the function file has drifted from cronAuth.ts");
});

const d = (iso: string) => new Date(iso);
const activity = (classId: string, year: number, month: number, latest: string): ClassMonth => ({
  classId, year, month, rows: 5, latestActivity: d(latest),
});
const sheet = (classId: string, year: number, month: number, over: Partial<SheetState> = {}): SheetRow => ({
  classId, year, month, driveFileId: "f", syncError: null, lastSyncedAt: d("2026-10-10T12:00:00Z"), status: "open", ...over,
});

test("nothing to do when everything is current", () => {
  assert.deepEqual(planReconcile([activity("A", 2026, 10, "2026-10-10T11:00:00Z")], [sheet("A", 2026, 10)]), []);
  assert.deepEqual(planReconcile([], []), []);
});

test("attendance with no Drive sheet yet is queued", () => {
  const plan = planReconcile([activity("A", 2026, 10, "2026-10-10T11:00:00Z")], []);
  assert.deepEqual(plan.map((t) => t.reason), ["never backed up"]);
});

test("a sheet older than the latest attendance change is queued", () => {
  const plan = planReconcile([activity("A", 2026, 10, "2026-10-10T13:00:00Z")], [sheet("A", 2026, 10)]);
  assert.deepEqual(plan.map((t) => t.reason), ["changed since last backup"]);
});

test("a failed backup is queued", () => {
  const plan = planReconcile([], [sheet("A", 2026, 10, { syncError: "boom" })]);
  assert.deepEqual(plan.map((t) => t.reason), ["last backup failed"]);
});

test("a sheet flagged for refresh is queued even when no attendance rows are left (e.g. after a student is deleted)", () => {
  const plan = planReconcile([], [sheet("A", 2026, 10, { lastSyncedAt: null })]);
  assert.deepEqual(plan.map((t) => t.reason), ["marked for refresh"]);
});

test("archived months are never queued, even if marked failed or stale", () => {
  assert.deepEqual(planReconcile([activity("A", 2026, 8, "2026-09-01T00:00:00Z")], [sheet("A", 2026, 8, { status: "closed", syncError: "x" })]), []);
  assert.equal(whyOutOfDate(undefined, { driveFileId: "f", syncError: "x", lastSyncedAt: null, status: "closed" }), null);
});

test("fresh work comes before retries of failures, oldest first", () => {
  const plan = planReconcile(
    [activity("B", 2026, 10, "2026-10-12T00:00:00Z"), activity("C", 2026, 9, "2026-09-30T00:00:00Z")],
    [sheet("A", 2026, 9, { syncError: "keeps failing" }), sheet("B", 2026, 10), sheet("C", 2026, 9, { lastSyncedAt: d("2026-09-15T00:00:00Z") })]
  );
  assert.deepEqual(plan.map((t) => `${t.classId}${t.year}-${t.month}:${t.reason}`), [
    "C2026-9:changed since last backup",
    "B2026-10:changed since last backup",
    "A2026-9:last backup failed",
  ]);
});
