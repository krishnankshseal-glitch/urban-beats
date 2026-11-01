import { prisma } from "./db";
import { groupByClassMonth, type DayGroup } from "./purgeEngine";
import { planReconcile, type ReconcileTarget } from "./reconcile";
import { syncAttendanceSheetWithin } from "./syncAttendanceSheet";
import { isDriveConfigured } from "./googleDrive";

const MAX_SYNCS_PER_RUN = 3;
const RUN_BUDGET_MS = 6000;

/**
 * Every class-month that still has attendance in the database (or a sheet
 * flagged for a refresh) whose Drive backup is stale, failed or missing.
 * Deliberately not limited to the current and previous month: the purge only
 * deletes a month once it is backed up, so an older month that was never
 * backed up must still get backed up here, or it would sit in the database
 * forever. Once purged, a month's attendance is gone and its sheet is
 * archived, so the set stays small.
 */
export async function findReconcileTargets(): Promise<ReconcileTarget[]> {
  const groups = (await prisma.attendance.groupBy({
    by: ["classId", "date"],
    _count: { _all: true },
    _max: { submittedAt: true, lastEditedAt: true },
  })) as unknown as Array<{
    classId: string;
    date: Date;
    _count: { _all: number };
    _max: { submittedAt: Date | null; lastEditedAt: Date | null };
  }>;
  const dayGroups: DayGroup[] = groups.map((g) => ({
    classId: g.classId,
    date: g.date,
    rows: g._count._all,
    latestActivity: new Date(Math.max(g._max.submittedAt?.getTime() ?? 0, g._max.lastEditedAt?.getTime() ?? 0)),
  }));

  // Archived sheets are included on purpose: the planner needs to see them to leave them alone.
  const sheets = await prisma.sheetMetadata.findMany();

  return planReconcile(
    groupByClassMonth(dayGroups),
    sheets.map((m) => ({
      classId: m.classId,
      year: m.year,
      month: m.month,
      driveFileId: m.driveFileId,
      syncError: m.syncError,
      lastSyncedAt: m.lastSyncedAt,
      status: m.status,
    }))
  );
}

/**
 * Safety net behind the instant syncs: brings any out-of-date Drive sheet up to
 * date (a few per run, so each run stays well inside the serverless time
 * limit). This is what guarantees the backup is complete after a teacher's
 * edit window has closed, even if a browser was shut mid-save or Drive was
 * briefly down. Cheap when there is nothing to do: one small query.
 */
export async function runReconcile() {
  if (!(await isDriveConfigured())) return { skipped: "Google Drive isn't connected.", synced: 0, failed: [] as string[], pending: 0 };

  const targets = await findReconcileTargets();
  const started = Date.now();
  let synced = 0;
  const failed: string[] = [];
  for (const t of targets.slice(0, MAX_SYNCS_PER_RUN)) {
    const left = RUN_BUDGET_MS - (Date.now() - started);
    if (left < 1500) break;
    const outcome = await syncAttendanceSheetWithin(t.classId, t.year, t.month, left);
    if (outcome.ok) synced++;
    else failed.push(`${t.year}-${String(t.month).padStart(2, "0")}: ${outcome.error}`);
  }
  return { synced, failed, pending: Math.max(0, targets.length - synced) };
}
