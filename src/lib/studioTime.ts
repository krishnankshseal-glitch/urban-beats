// The studio operates in India (Asia/Kolkata, UTC+5:30, no daylight saving),
// while serverless functions run in UTC. A fixed-offset shift is enough —
// no timezone database needed for a single, DST-free offset.
const STUDIO_UTC_OFFSET_MINUTES = 330;

function studioShiftedNow(): Date {
  return new Date(Date.now() + STUDIO_UTC_OFFSET_MINUTES * 60 * 1000);
}

/** Today's studio calendar date, returned as a UTC-midnight Date (matches a Postgres `date` column). */
export function getStudioTodayAsUtcDate(): Date {
  const s = studioShiftedNow();
  return new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()));
}

export function getStudioYearMonth(): { year: number; month: number } {
  const s = studioShiftedNow();
  return { year: s.getUTCFullYear(), month: s.getUTCMonth() + 1 };
}

export function toUtcDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
