// Pure helpers for the end-of-month review — no network, easy to unit-verify.
// Mirrors week.ts's approach: dates are computed, never manually archived.

function toISODateLocal(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** 'YYYY-MM-01' for the month containing `d`. */
export function monthStartISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** The most recently completed calendar month (last month, day 1), as a Date. */
export function lastCompletedMonthStart(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth() - 1, 1);
}

/** "September 2026" for a 'YYYY-MM-01' string. */
export function monthLabel(monthStart: string): string {
  const [y, m] = monthStart.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * The most recent completed month that still needs reviewing, or null if the
 * household is caught up (or didn't exist yet for that month). `reviewedMonths`
 * is the set of 'YYYY-MM-01' months already present in bill_month_snapshots.
 */
export function pendingReviewMonth(
  householdCreatedAt: string,
  reviewedMonths: string[],
  now: Date = new Date()
): string | null {
  const target = monthStartISO(lastCompletedMonthStart(now));
  const createdMonth = monthStartISO(new Date(householdCreatedAt));
  if (target < createdMonth) return null;
  if (reviewedMonths.includes(target)) return null;
  return target;
}

export type MonthWeekBucket = {
  label: string;
  clippedStart: string;
  clippedEnd: string;
};

/**
 * Splits a calendar month into the household's weekly buckets (by
 * week_start_day), clipped to the month's own bounds — so a week that spans the
 * boundary shows up as a shorter/partial bucket rather than pulling in days from
 * the neighboring month. Buckets are labeled "Week 1", "Week 2", …
 */
export function weekBucketsInMonth(monthStart: string, weekStartsOn: number): MonthWeekBucket[] {
  const [y, m] = monthStart.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0); // day 0 of next month = last day of this one

  const back = (first.getDay() - weekStartsOn + 7) % 7;
  const bucketStart = new Date(first);
  bucketStart.setDate(first.getDate() - back);

  const buckets: MonthWeekBucket[] = [];
  let cursor = new Date(bucketStart);
  let n = 1;
  while (cursor <= last) {
    const end = new Date(cursor);
    end.setDate(cursor.getDate() + 6);
    const clippedStart = cursor < first ? first : cursor;
    const clippedEnd = end > last ? last : end;
    buckets.push({
      label: `Week ${n}`,
      clippedStart: toISODateLocal(clippedStart),
      clippedEnd: toISODateLocal(clippedEnd),
    });
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() + 7);
    n++;
  }
  return buckets;
}
