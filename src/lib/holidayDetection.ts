import { prisma } from "./db";
import { getStudioTodayAsUtcDate } from "./studioTime";
import { syncAttendanceSheet } from "./syncAttendanceSheet";

const HEARTBEAT_KEY = "holidayJobLastHeartbeatAt";
// How many days back to look each run. Small and generous on purpose: this
// only ever creates a ClassHoliday for a day that's fully in the past and
// doesn't already have one, so re-checking the same recent days on every
// run is harmless (existing rows are just skipped) and self-heals a missed
// or delayed invocation without needing to look back arbitrarily far.
const LOOKBACK_DAYS = 5;

/**
 * For every active class with at least one scheduled weekday set, checks
 * the last few days for any that (a) fall on a scheduled weekday,
 * (b) are fully in the past (never today), (c) have zero attendance rows,
 * and (d) don't already have a ClassHoliday recorded - and creates one.
 *
 * Classes with an empty scheduleDays are skipped entirely, never guessed
 * at from the free-text `schedule` field.
 */
export async function markMissedDaysAsHolidays() {
  await prisma.appSetting.upsert({
    where: { key: HEARTBEAT_KEY },
    update: { value: new Date().toISOString() },
    create: { key: HEARTBEAT_KEY, value: new Date().toISOString() },
  });

  const today = getStudioTodayAsUtcDate();
  const candidateDates: Date[] = [];
  for (let i = 1; i <= LOOKBACK_DAYS; i++) {
    candidateDates.push(new Date(today.getTime() - i * 24 * 60 * 60 * 1000));
  }

  const classes = await prisma.class.findMany({
    where: { isActive: true, scheduleDays: { isEmpty: false } },
    select: { id: true, scheduleDays: true },
  });

  let created = 0;
  const affectedMonths = new Set<string>(); // "classId|year|month", deduped across the whole run

  for (const cls of classes) {
    const scheduledDates = candidateDates.filter((d) => cls.scheduleDays.includes(d.getUTCDay()));
    if (scheduledDates.length === 0) continue;

    const [existingAttendance, existingHolidays] = await Promise.all([
      prisma.attendance.findMany({
        where: { classId: cls.id, date: { in: scheduledDates } },
        select: { date: true },
      }),
      prisma.classHoliday.findMany({
        where: { classId: cls.id, date: { in: scheduledDates } },
        select: { date: true },
      }),
    ]);
    const covered = new Set([...existingAttendance, ...existingHolidays].map((r) => r.date.toISOString()));

    const missing = scheduledDates.filter((d) => !covered.has(d.toISOString()));
    if (missing.length === 0) continue;

    await prisma.classHoliday.createMany({
      data: missing.map((date) => ({ classId: cls.id, date })),
      skipDuplicates: true,
    });
    created += missing.length;
    for (const d of missing) {
      affectedMonths.add(`${cls.id}|${d.getUTCFullYear()}|${d.getUTCMonth() + 1}`);
    }
  }

  // Re-sync so the Drive Excel file picks up the new H markers now, rather
  // than waiting for the next unrelated submit/edit to that class+month.
  // Scheduled functions have a 30s budget in total, so this is capped -
  // any remainder just gets picked up by the next real submit/edit as before,
  // same as it worked prior to this job existing at all.
  const toSync = Array.from(affectedMonths).slice(0, 20);
  for (const key of toSync) {
    const [classId, year, month] = key.split("|");
    await syncAttendanceSheet(classId, Number(year), Number(month));
  }

  return { classesChecked: classes.length, holidaysCreated: created, resynced: toSync.length };
}

export async function getHolidayJobHeartbeat(): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: HEARTBEAT_KEY } });
  return row?.value ?? null;
}
