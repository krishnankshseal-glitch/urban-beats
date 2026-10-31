import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { getStudioTodayAsUtcDate } from "./studioTime";
import {
  runPurge,
  monthKey,
  type PurgeStore,
  type PurgeResult,
  type DayGroup,
  type SheetState,
} from "./purgeEngine";

const HEARTBEAT_KEY = "purgeJobLastHeartbeatAt";
const LAST_RUN_MONTH_KEY = "purgeJobLastRunMonth";

/** The real, database-backed store. The decisions themselves live in purgeEngine.ts. */
export const prismaPurgeStore: PurgeStore = {
  async listOldDayGroups(cutoff: Date): Promise<DayGroup[]> {
    // One aggregate query instead of loading every old row into memory.
    const groups = (await prisma.attendance.groupBy({
      by: ["classId", "date"],
      where: { date: { lt: cutoff } },
      _count: { _all: true },
      _max: { submittedAt: true, lastEditedAt: true },
    })) as unknown as Array<{
      classId: string;
      date: Date;
      _count: { _all: number };
      _max: { submittedAt: Date | null; lastEditedAt: Date | null };
    }>;
    return groups.map((g) => ({
      classId: g.classId,
      date: g.date,
      rows: g._count._all,
      latestActivity: new Date(Math.max(g._max.submittedAt?.getTime() ?? 0, g._max.lastEditedAt?.getTime() ?? 0)),
    }));
  },

  async getSheets(keys): Promise<Map<string, SheetState>> {
    const sheets = new Map<string, SheetState>();
    if (keys.length === 0) return sheets;
    const metas = await prisma.sheetMetadata.findMany({
      where: {
        classId: { in: Array.from(new Set(keys.map((k) => k.classId))) },
        year: { in: Array.from(new Set(keys.map((k) => k.year))) },
      },
    });
    for (const m of metas) {
      sheets.set(monthKey(m.classId, m.year, m.month), {
        driveFileId: m.driveFileId,
        syncError: m.syncError,
        lastSyncedAt: m.lastSyncedAt,
        status: m.status,
      });
    }
    return sheets;
  },

  async archiveIfUnchanged({ classId, year, month, start, end, syncedAt }): Promise<number | null> {
    return prisma.$transaction(
      async (tx) => {
        const changedSince = await tx.attendance.count({
          where: {
            classId,
            date: { gte: start, lt: end },
            OR: [{ submittedAt: { gt: syncedAt } }, { lastEditedAt: { gt: syncedAt } }],
          },
        });
        if (changedSince > 0) return null;
        const deleted = await tx.attendance.deleteMany({
          where: { classId, date: { gte: start, lt: end } },
        });
        // Marked in the same transaction as the delete: once the rows are gone
        // the Drive file is the only complete copy, and anything that would
        // rebuild it from the (now empty) database must be refused.
        await tx.sheetMetadata.update({
          where: { classId_year_month: { classId, year, month } },
          data: { status: "closed" },
        });
        return deleted.count;
      },
      { timeout: 20000, maxWait: 5000 }
    );
  },
};

function describeResult(result: PurgeResult, classNames: Map<string, string>): string {
  const label = (i: { classId: string; year: number; month: number }) =>
    `${classNames.get(i.classId) ?? i.classId} ${i.year}-${String(i.month).padStart(2, "0")}`;
  const cutoff = result.cutoff.toISOString().slice(0, 10);
  let text = `Attendance dated before ${cutoff}: deleted ${result.deletedRows} row(s) across ${result.deletedClassMonths} class-month(s), each confirmed backed up to Drive first.`;
  const skipped = result.items.filter((i) => i.outcome === "skipped");
  if (skipped.length > 0) {
    text += ` Left alone, not confirmed backed up (checked again daily): `;
    text += skipped
      .slice(0, 3)
      .map((i) => `${label(i)} - ${i.reason}`)
      .join("; ");
    if (skipped.length > 3) text += `; and ${skipped.length - 3} more`;
    text += ".";
  }
  return text.slice(0, 1500);
}

/**
 * Entry point for the daily scheduled job. Attendance is kept for the current
 * month and the previous one; anything older is deleted, per class and month,
 * once its Drive backup is confirmed complete. It runs every day (not just on
 * the 1st) so a month that couldn't be confirmed one day is picked up as soon
 * as its backup catches up. Most days there is nothing to do and it costs one
 * small query. Updates the heartbeat first, regardless of outcome, so the age
 * of that single timestamp is by itself proof the schedule stopped firing.
 */
export async function runDailyPurge() {
  await prisma.appSetting.upsert({
    where: { key: HEARTBEAT_KEY },
    update: { value: new Date().toISOString() },
    create: { key: HEARTBEAT_KEY, value: new Date().toISOString() },
  });

  const today = getStudioTodayAsUtcDate();
  const result = await runPurge(prismaPurgeStore, today);

  // An audit entry whenever something is deleted, plus one a month for anything
  // being held back - not one every day for the same unchanged situation.
  const isFirstOfMonth = today.getUTCDate() === 1;
  if (result.deletedClassMonths > 0 || (isFirstOfMonth && result.items.length > 0)) {
    const ids = Array.from(new Set(result.items.map((i) => i.classId)));
    const classes = ids.length
      ? await prisma.class.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      : [];
    const names = new Map<string, string>(classes.map((c: { id: string; name: string }) => [c.id, c.name]));
    await writeAuditLog({
      userId: null,
      action: "AUTO_PURGE_ATTENDANCE",
      entityType: "Attendance",
      detail: describeResult(result, names),
    });
  }

  if (isFirstOfMonth) {
    const monthLabel = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;
    await prisma.appSetting.upsert({
      where: { key: LAST_RUN_MONTH_KEY },
      update: { value: monthLabel },
      create: { key: LAST_RUN_MONTH_KEY, value: monthLabel },
    });
  }

  return {
    cutoff: result.cutoff.toISOString().slice(0, 10),
    checkedClassMonths: result.items.length,
    deletedRows: result.deletedRows,
    deletedClassMonths: result.deletedClassMonths,
    skipped: result.skipped,
  };
}

/** Kept under its old name so existing imports keep working. */
export const runMonthlyPurgeIfDue = runDailyPurge;

export async function getPurgeJobHeartbeat(): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: HEARTBEAT_KEY } });
  return row?.value ?? null;
}
