import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { getStudioTodayAsUtcDate, getStudioYearMonth } from "./studioTime";

const HEARTBEAT_KEY = "purgeJobLastHeartbeatAt";
const LAST_RUN_MONTH_KEY = "purgeJobLastRunMonth";

/**
 * Deletes attendance for the given month, but only for classes whose
 * Drive backup for that exact month is already confirmed successful
 * (sheetMetadata.driveFileId set, no syncError). Classes that aren't yet
 * confirmed are left untouched - not deleted, not retried inline here -
 * so this stays fast and simply gets re-evaluated on the next run once
 * the regular per-submission sync (which already runs after every
 * attendance save) has had a chance to catch up.
 */
export async function purgeMonthIfBackedUp(year: number, month: number) {
  const startOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const startOfNextMonth = new Date(Date.UTC(year, month, 1));

  const rows = await prisma.attendance.findMany({
    where: { date: { gte: startOfMonth, lt: startOfNextMonth } },
    distinct: ["classId"],
    select: { classId: true },
  });
  const classIds = rows.map((r) => r.classId);
  if (classIds.length === 0) {
    return { classesChecked: 0, deletedClasses: 0, skippedClasses: 0, deletedRows: 0 };
  }

  const metas = await prisma.sheetMetadata.findMany({
    where: { classId: { in: classIds }, year, month },
  });
  const confirmedClassIds = metas.filter((m) => m.driveFileId && !m.syncError).map((m) => m.classId);
  const skippedClassIds = classIds.filter((id) => !confirmedClassIds.includes(id));

  let deletedRows = 0;
  if (confirmedClassIds.length > 0) {
    const del = await prisma.attendance.deleteMany({
      where: { classId: { in: confirmedClassIds }, date: { gte: startOfMonth, lt: startOfNextMonth } },
    });
    deletedRows = del.count;
  }

  const monthLabel = `${year}-${String(month).padStart(2, "0")}`;
  await writeAuditLog({
    userId: null,
    action: "AUTO_PURGE_ATTENDANCE",
    entityType: "Attendance",
    detail:
      skippedClassIds.length === 0
        ? `${monthLabel}: deleted ${deletedRows} row(s) across ${confirmedClassIds.length} class(es) - all confirmed backed up to Drive first.`
        : `${monthLabel}: deleted ${deletedRows} row(s) across ${confirmedClassIds.length} class(es). Skipped ${skippedClassIds.length} class(es) not yet confirmed backed up to Drive - will retry next month.`,
  });

  return { classesChecked: classIds.length, deletedClasses: confirmedClassIds.length, skippedClasses: skippedClassIds.length, deletedRows };
}

/**
 * Entry point for the scheduled job. Safe to call more than once a day:
 * it no-ops unless it's the 1st of the month in studio-local time, and
 * won't run twice for the same month even if invoked repeatedly.
 * Always updates the heartbeat first, regardless of outcome, so staleness
 * of that single timestamp is by itself proof the schedule stopped firing.
 */
export async function runMonthlyPurgeIfDue() {
  await prisma.appSetting.upsert({
    where: { key: HEARTBEAT_KEY },
    update: { value: new Date().toISOString() },
    create: { key: HEARTBEAT_KEY, value: new Date().toISOString() },
  });

  const today = getStudioTodayAsUtcDate();
  if (today.getUTCDate() !== 1) {
    return { ran: false, reason: "not the 1st of the month (studio time)" as const };
  }

  const { year, month } = getStudioYearMonth();
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  const lastRun = await prisma.appSetting.findUnique({ where: { key: LAST_RUN_MONTH_KEY } });
  if (lastRun?.value === monthKey) {
    return { ran: false, reason: "already ran this month" as const };
  }

  let targetYear = year;
  let targetMonth = month - 2;
  if (targetMonth <= 0) {
    targetMonth += 12;
    targetYear -= 1;
  }

  const result = await purgeMonthIfBackedUp(targetYear, targetMonth);

  await prisma.appSetting.upsert({
    where: { key: LAST_RUN_MONTH_KEY },
    update: { value: monthKey },
    create: { key: LAST_RUN_MONTH_KEY, value: monthKey },
  });

  return { ran: true, target: `${targetYear}-${String(targetMonth).padStart(2, "0")}`, ...result };
}

export async function getPurgeJobHeartbeat(): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: HEARTBEAT_KEY } });
  return row?.value ?? null;
}
