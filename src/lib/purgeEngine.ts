/**
 * The decision-making behind the attendance purge, kept free of any database
 * or Google code so it can be tested directly (see tests/purge-engine.test.ts).
 * attendancePurge.ts supplies the real database-backed store.
 *
 * Rule: attendance is kept for the current month and the one before it.
 * Anything older is eligible - but a class's month is only ever deleted once
 * its Excel backup in Drive is confirmed to contain everything currently in
 * the database. Anything not confirmed is left alone and simply looked at
 * again on the next run.
 */

export type DayGroup = { classId: string; date: Date; rows: number; latestActivity: Date };
export type ClassMonth = { classId: string; year: number; month: number; rows: number; latestActivity: Date };
export type SheetState = {
  driveFileId: string | null;
  syncError: string | null;
  lastSyncedAt: Date | null;
  status: string;
};

export interface PurgeStore {
  /** Per class and day, for attendance dated strictly before the cutoff. */
  listOldDayGroups(cutoff: Date): Promise<DayGroup[]>;
  getSheets(keys: { classId: string; year: number; month: number }[]): Promise<Map<string, SheetState>>;
  /**
   * In one atomic step: if no row of this class-month was created or edited
   * after `syncedAt`, delete all of them and mark the month archived
   * ("closed"). Returns the number deleted, or null (and changes nothing)
   * if something changed after the backup was taken.
   */
  archiveIfUnchanged(args: {
    classId: string;
    year: number;
    month: number;
    start: Date;
    end: Date;
    syncedAt: Date;
  }): Promise<number | null>;
}

export type PurgeItem = ClassMonth & {
  outcome: "deleted" | "skipped" | "would_delete" | "would_skip";
  reason?: string;
};
export type PurgeResult = {
  cutoff: Date;
  items: PurgeItem[];
  deletedRows: number;
  deletedClassMonths: number;
  skipped: number;
};

/** First day of the previous month: attendance dated before this is eligible for deletion. */
export function retentionCutoff(todayUtc: Date): Date {
  return new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth() - 1, 1));
}

export function monthKey(classId: string, year: number, month: number): string {
  return `${classId}|${year}|${month}`;
}

export function groupByClassMonth(groups: DayGroup[]): ClassMonth[] {
  const byKey = new Map<string, ClassMonth>();
  for (const g of groups) {
    const year = g.date.getUTCFullYear();
    const month = g.date.getUTCMonth() + 1;
    const key = monthKey(g.classId, year, month);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { classId: g.classId, year, month, rows: g.rows, latestActivity: g.latestActivity });
    } else {
      existing.rows += g.rows;
      if (g.latestActivity.getTime() > existing.latestActivity.getTime()) existing.latestActivity = g.latestActivity;
    }
  }
  return Array.from(byKey.values()).sort(
    (a, b) => a.year - b.year || a.month - b.month || a.classId.localeCompare(b.classId)
  );
}

/** Is this class-month safe to delete? Only if its Drive backup is complete and current. */
export function decide(cm: ClassMonth, sheet: SheetState | undefined): { decision: "delete" | "skip"; reason?: string } {
  if (!sheet || !sheet.driveFileId) return { decision: "skip", reason: "No Drive backup of this month exists yet." };
  if (sheet.status === "closed") {
    return {
      decision: "skip",
      reason: "This month is already archived, yet attendance rows appeared in it. Left untouched for a person to check.",
    };
  }
  if (sheet.syncError) return { decision: "skip", reason: `The last backup attempt failed: ${sheet.syncError}` };
  if (!sheet.lastSyncedAt) return { decision: "skip", reason: "The backup has no completed sync recorded." };
  if (sheet.lastSyncedAt.getTime() < cm.latestActivity.getTime()) {
    return { decision: "skip", reason: "Attendance was changed after the last backup." };
  }
  return { decision: "delete" };
}

export async function runPurge(
  store: PurgeStore,
  todayUtc: Date,
  opts: { dryRun?: boolean } = {}
): Promise<PurgeResult> {
  const cutoff = retentionCutoff(todayUtc);
  const classMonths = groupByClassMonth(await store.listOldDayGroups(cutoff));
  const empty: PurgeResult = { cutoff, items: [], deletedRows: 0, deletedClassMonths: 0, skipped: 0 };
  if (classMonths.length === 0) return empty;

  const sheets = await store.getSheets(
    classMonths.map(({ classId, year, month }) => ({ classId, year, month }))
  );

  const result: PurgeResult = { ...empty, items: [] };
  for (const cm of classMonths) {
    const sheet = sheets.get(monthKey(cm.classId, cm.year, cm.month));
    const verdict = decide(cm, sheet);

    if (verdict.decision === "skip") {
      result.skipped++;
      result.items.push({ ...cm, outcome: opts.dryRun ? "would_skip" : "skipped", reason: verdict.reason });
      continue;
    }
    if (opts.dryRun) {
      result.items.push({ ...cm, outcome: "would_delete" });
      continue;
    }

    const deleted = await store.archiveIfUnchanged({
      classId: cm.classId,
      year: cm.year,
      month: cm.month,
      start: new Date(Date.UTC(cm.year, cm.month - 1, 1)),
      end: new Date(Date.UTC(cm.year, cm.month, 1)),
      syncedAt: sheet!.lastSyncedAt!,
    });
    if (deleted === null) {
      result.skipped++;
      result.items.push({
        ...cm,
        outcome: "skipped",
        reason: "Attendance changed while the purge was running - it will be retried.",
      });
    } else {
      result.deletedRows += deleted;
      result.deletedClassMonths++;
      result.items.push({ ...cm, rows: deleted, outcome: "deleted" });
    }
  }
  return result;
}
