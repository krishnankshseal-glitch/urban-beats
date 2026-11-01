import type { ClassMonth, SheetState } from "./purgeEngine";

/**
 * Works out which class-months have a Drive backup that is missing, failed,
 * flagged for a refresh, or older than the latest attendance change. Pure, so
 * it can be tested; reconcileJob.ts supplies the data and does the syncing.
 */
export type SheetRow = SheetState & { classId: string; year: number; month: number };
export type ReconcileTarget = { classId: string; year: number; month: number; reason: string };

const FAILED = "last backup failed";

/** Why this class-month's Drive sheet needs rebuilding, or null if it is current (or archived). */
export function whyOutOfDate(activity: ClassMonth | undefined, sheet: SheetState | undefined): string | null {
  // Archived: the rows were deleted after backup, so the Drive file is now the only copy. Never rebuild it.
  if (sheet?.status === "closed") return null;
  if (!sheet) return activity ? "never backed up" : null;
  if (sheet.syncError) return FAILED;
  if (!sheet.lastSyncedAt) return "marked for refresh";
  if (activity && sheet.lastSyncedAt.getTime() < activity.latestActivity.getTime()) return "changed since last backup";
  return null;
}

const key = (classId: string, year: number, month: number) => `${classId}|${year}|${month}`;

/**
 * What to rebuild, in order: fresh work first (so a teacher's just-saved
 * attendance isn't stuck behind a sheet that keeps failing), oldest first
 * within each group, retries of failures last.
 */
export function planReconcile(activity: ClassMonth[], sheets: SheetRow[]): ReconcileTarget[] {
  const sheetByKey = new Map(sheets.map((s) => [key(s.classId, s.year, s.month), s] as const));
  const seen = new Set<string>();
  const targets: ReconcileTarget[] = [];

  for (const a of activity) {
    const k = key(a.classId, a.year, a.month);
    seen.add(k);
    const reason = whyOutOfDate(a, sheetByKey.get(k));
    if (reason) targets.push({ classId: a.classId, year: a.year, month: a.month, reason });
  }
  // Sheets with no attendance rows left (every mark removed, a student deleted...) can still be flagged.
  for (const s of sheets) {
    if (seen.has(key(s.classId, s.year, s.month))) continue;
    const reason = whyOutOfDate(undefined, s);
    if (reason) targets.push({ classId: s.classId, year: s.year, month: s.month, reason });
  }

  const isRetry = (t: ReconcileTarget) => (t.reason === FAILED ? 1 : 0);
  return targets.sort(
    (a, b) =>
      isRetry(a) - isRetry(b) || a.year - b.year || a.month - b.month || a.classId.localeCompare(b.classId)
  );
}
