import test from "node:test";
import assert from "node:assert/strict";
import {
  runPurge, retentionCutoff, groupByClassMonth, decide, monthKey,
  type PurgeStore, type SheetState,
} from "../src/lib/purgeEngine";

const D = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const T = (iso: string) => new Date(iso);
type Row = { classId: string; date: Date; submittedAt: Date; lastEditedAt: Date | null };
const row = (classId: string, date: Date, submitted: string, edited: string | null = null): Row => ({
  classId, date, submittedAt: T(submitted), lastEditedAt: edited ? T(edited) : null,
});

function makeStore(rows: Row[], sheets: Record<string, Partial<SheetState>> = {}, beforeArchive?: () => void) {
  const sheetMap = new Map<string, SheetState>();
  for (const [k, v] of Object.entries(sheets)) {
    sheetMap.set(k, { driveFileId: "file", syncError: null, lastSyncedAt: null, status: "open", ...v });
  }
  const calls = { archive: 0 };
  const store: PurgeStore = {
    async listOldDayGroups(cutoff) {
      const byDay = new Map<string, { classId: string; date: Date; rows: number; latest: number }>();
      for (const r of rows.filter((x) => x.date < cutoff)) {
        const key = `${r.classId}|${r.date.toISOString()}`;
        const latest = Math.max(r.submittedAt.getTime(), r.lastEditedAt?.getTime() ?? 0);
        const g = byDay.get(key) ?? { classId: r.classId, date: r.date, rows: 0, latest: 0 };
        g.rows++;
        g.latest = Math.max(g.latest, latest);
        byDay.set(key, g);
      }
      return Array.from(byDay.values()).map((g) => ({ classId: g.classId, date: g.date, rows: g.rows, latestActivity: new Date(g.latest) }));
    },
    async getSheets(keys) {
      const out = new Map<string, SheetState>();
      for (const k of keys) {
        const key = monthKey(k.classId, k.year, k.month);
        const s = sheetMap.get(key);
        if (s) out.set(key, s);
      }
      return out;
    },
    async archiveIfUnchanged({ classId, year, month, start, end, syncedAt }) {
      calls.archive++;
      beforeArchive?.();
      const inRange = rows.filter((r) => r.classId === classId && r.date >= start && r.date < end);
      if (inRange.some((r) => r.submittedAt > syncedAt || (r.lastEditedAt !== null && r.lastEditedAt > syncedAt))) return null;
      for (const r of inRange) rows.splice(rows.indexOf(r), 1);
      const s = sheetMap.get(monthKey(classId, year, month));
      if (s) s.status = "closed";
      return inRange.length;
    },
  };
  return { store, rows, sheetMap, calls };
}

const K = monthKey;

test("retention cutoff is the first day of the previous month", () => {
  const cases: [Date, Date][] = [
    [D(2026, 8, 1), D(2026, 7, 1)],
    [D(2026, 8, 31), D(2026, 7, 1)],
    [D(2026, 1, 15), D(2025, 12, 1)],
    [D(2026, 2, 1), D(2026, 1, 1)],
    [D(2026, 3, 31), D(2026, 2, 1)],
    [D(2026, 12, 31), D(2026, 11, 1)],
  ];
  for (const [today, expected] of cases) {
    assert.equal(retentionCutoff(today).toISOString(), expected.toISOString(), `today ${today.toISOString()}`);
  }
});

test("when August begins June goes and July stays; when September begins July goes", async () => {
  const { store, rows } = makeStore(
    [
      row("A", D(2026, 6, 10), "2026-06-10T10:00:00Z"), row("A", D(2026, 6, 17), "2026-06-17T10:00:00Z"),
      row("A", D(2026, 7, 8), "2026-07-08T10:00:00Z"), row("A", D(2026, 7, 15), "2026-07-15T10:00:00Z"),
      row("A", D(2026, 8, 1), "2026-08-01T10:00:00Z"),
    ],
    { [K("A", 2026, 6)]: { lastSyncedAt: T("2026-06-18T00:00:00Z") }, [K("A", 2026, 7)]: { lastSyncedAt: T("2026-07-16T00:00:00Z") } }
  );
  const aug = await runPurge(store, D(2026, 8, 1));
  assert.equal(aug.deletedRows, 2);
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.date >= D(2026, 7, 1)));
  const sep = await runPurge(store, D(2026, 9, 1));
  assert.equal(sep.deletedRows, 2);
  assert.equal(rows.length, 1);
});

test("the cutoff day itself is kept; the day before it is eligible", async () => {
  const { store, rows } = makeStore(
    [row("A", D(2026, 6, 30), "2026-06-30T10:00:00Z"), row("A", D(2026, 7, 1), "2026-07-01T10:00:00Z")],
    { [K("A", 2026, 6)]: { lastSyncedAt: T("2026-07-02T00:00:00Z") } }
  );
  const r = await runPurge(store, D(2026, 8, 1));
  assert.equal(r.deletedRows, 1);
  assert.deepEqual(rows.map((x) => x.date.toISOString()), [D(2026, 7, 1).toISOString()]);
});

test("nothing old, nothing to do", async () => {
  const { store, rows } = makeStore([row("A", D(2026, 7, 8), "2026-07-08T10:00:00Z")]);
  const r = await runPurge(store, D(2026, 8, 1));
  assert.deepEqual(r.items, []);
  assert.equal(rows.length, 1);
});

test("a month is never deleted without a backup, and says why", async () => {
  const june = row("A", D(2026, 6, 10), "2026-06-10T10:00:00Z");
  const reasonFor = async (sheet?: Partial<SheetState>) => {
    const { store, rows } = makeStore([{ ...june }], sheet ? { [K("A", 2026, 6)]: sheet } : {});
    const r = await runPurge(store, D(2026, 8, 1));
    assert.equal(rows.length, 1, "data must survive");
    assert.equal(r.deletedRows, 0);
    return r.items[0].reason!;
  };
  assert.match(await reasonFor(undefined), /No Drive backup/);
  assert.match(await reasonFor({ driveFileId: null }), /No Drive backup/);
  assert.match(await reasonFor({ syncError: "Hit Google's rate limit", lastSyncedAt: T("2026-06-11T00:00:00Z") }), /Hit Google's rate limit/);
  assert.match(await reasonFor({ lastSyncedAt: null }), /no completed sync/);
  assert.match(await reasonFor({ lastSyncedAt: T("2026-06-09T00:00:00Z") }), /changed after the last backup/);
});

test("an edit made after the backup holds the month back", async () => {
  const { store, rows } = makeStore(
    [row("A", D(2026, 6, 10), "2026-06-10T10:00:00Z", "2026-06-20T09:00:00Z")],
    { [K("A", 2026, 6)]: { lastSyncedAt: T("2026-06-11T00:00:00Z") } }
  );
  const r = await runPurge(store, D(2026, 8, 1));
  assert.equal(r.deletedRows, 0);
  assert.equal(rows.length, 1);
});

test("classes are judged independently", async () => {
  const { store, rows } = makeStore(
    [row("A", D(2026, 6, 10), "2026-06-10T10:00:00Z"), row("B", D(2026, 6, 10), "2026-06-10T10:00:00Z")],
    { [K("A", 2026, 6)]: { lastSyncedAt: T("2026-06-11T00:00:00Z") } }
  );
  const r = await runPurge(store, D(2026, 8, 1));
  assert.equal(r.deletedClassMonths, 1);
  assert.equal(r.skipped, 1);
  assert.deepEqual(rows.map((x) => x.classId), ["B"]);
});

test("older leftover months are picked up too, not just exactly two months back", async () => {
  const { store, rows } = makeStore(
    [row("A", D(2026, 5, 10), "2026-05-10T10:00:00Z"), row("A", D(2026, 6, 10), "2026-06-10T10:00:00Z")],
    { [K("A", 2026, 5)]: { lastSyncedAt: T("2026-05-11T00:00:00Z") }, [K("A", 2026, 6)]: { lastSyncedAt: T("2026-06-11T00:00:00Z") } }
  );
  const r = await runPurge(store, D(2026, 8, 1));
  assert.equal(r.deletedClassMonths, 2);
  assert.equal(rows.length, 0);
});

test("a month skipped today is deleted on a later day once its backup catches up", async () => {
  const { store, rows, sheetMap } = makeStore([row("A", D(2026, 6, 10), "2026-06-10T10:00:00Z")]);
  assert.equal((await runPurge(store, D(2026, 8, 1))).deletedRows, 0);
  sheetMap.set(K("A", 2026, 6), { driveFileId: "f", syncError: null, lastSyncedAt: T("2026-08-02T08:00:00Z"), status: "open" });
  const later = await runPurge(store, D(2026, 8, 3));
  assert.equal(later.deletedRows, 1);
  assert.equal(rows.length, 0);
});

test("deleting a month marks it archived, and a second run changes nothing", async () => {
  const { store, sheetMap, calls } = makeStore(
    [row("A", D(2026, 6, 10), "2026-06-10T10:00:00Z")],
    { [K("A", 2026, 6)]: { lastSyncedAt: T("2026-06-11T00:00:00Z") } }
  );
  await runPurge(store, D(2026, 8, 1));
  assert.equal(sheetMap.get(K("A", 2026, 6))!.status, "closed");
  const again = await runPurge(store, D(2026, 8, 2));
  assert.deepEqual(again.items, []);
  assert.equal(calls.archive, 1);
});

test("rows that appear in an already-archived month are left for a person to check", async () => {
  const { store, rows } = makeStore(
    [row("A", D(2026, 6, 10), "2026-06-10T10:00:00Z")],
    { [K("A", 2026, 6)]: { status: "closed", lastSyncedAt: T("2026-07-01T00:00:00Z") } }
  );
  const r = await runPurge(store, D(2026, 8, 1));
  assert.equal(r.deletedRows, 0);
  assert.match(r.items[0].reason!, /already archived/);
  assert.equal(rows.length, 1);
});

test("a dry run changes nothing and reports what it would do", async () => {
  const { store, rows, calls } = makeStore(
    [row("A", D(2026, 6, 10), "2026-06-10T10:00:00Z"), row("B", D(2026, 6, 10), "2026-06-10T10:00:00Z")],
    { [K("A", 2026, 6)]: { lastSyncedAt: T("2026-06-11T00:00:00Z") } }
  );
  const r = await runPurge(store, D(2026, 8, 1), { dryRun: true });
  assert.deepEqual(r.items.map((i) => i.outcome).sort(), ["would_delete", "would_skip"]);
  assert.equal(r.deletedRows, 0);
  assert.equal(rows.length, 2);
  assert.equal(calls.archive, 0);
});

test("an edit that lands while the purge is running is never deleted", async () => {
  const june = row("A", D(2026, 6, 10), "2026-06-10T10:00:00Z");
  const { store, rows, sheetMap } = makeStore(
    [june],
    { [K("A", 2026, 6)]: { lastSyncedAt: T("2026-06-11T00:00:00Z") } },
    () => { june.lastEditedAt = T("2026-08-01T00:00:05Z"); } // admin edit between planning and deleting
  );
  const r = await runPurge(store, D(2026, 8, 1));
  assert.equal(r.deletedRows, 0);
  assert.equal(rows.length, 1);
  assert.match(r.items[0].reason!, /while the purge was running/);
  assert.equal(sheetMap.get(K("A", 2026, 6))!.status, "open");
});

test("groupByClassMonth totals rows and keeps the latest activity", () => {
  const out = groupByClassMonth([
    { classId: "A", date: D(2026, 6, 3), rows: 2, latestActivity: T("2026-06-03T10:00:00Z") },
    { classId: "A", date: D(2026, 6, 20), rows: 3, latestActivity: T("2026-06-25T10:00:00Z") },
    { classId: "A", date: D(2026, 7, 2), rows: 1, latestActivity: T("2026-07-02T10:00:00Z") },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].rows, 5);
  assert.equal(out[0].latestActivity.toISOString(), "2026-06-25T10:00:00.000Z");
});

test("decide: only a complete, current, error-free backup allows deletion", () => {
  const cm = { classId: "A", year: 2026, month: 6, rows: 4, latestActivity: T("2026-06-20T00:00:00Z") };
  const ok: SheetState = { driveFileId: "f", syncError: null, lastSyncedAt: T("2026-06-21T00:00:00Z"), status: "open" };
  assert.equal(decide(cm, ok).decision, "delete");
  assert.equal(decide(cm, { ...ok, lastSyncedAt: T("2026-06-20T00:00:00Z") }).decision, "delete"); // exactly equal counts as current
  assert.equal(decide(cm, { ...ok, lastSyncedAt: T("2026-06-19T23:59:59Z") }).decision, "skip");
});
