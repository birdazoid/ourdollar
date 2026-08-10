// Pure helpers for the end-of-month review — no network, easy to unit-verify.
// Mirrors week.ts's approach: dates are computed, never manually archived.

import { weeksInPeriod } from '@/lib/period';

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

/** "September" — just the month, for labels that already imply the year. */
export function monthName(monthStart: string): string {
  return monthLabel(monthStart).split(' ')[0];
}

/** The 'YYYY-MM-01' one calendar month before `month`. */
export function monthBefore(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return monthStartISO(new Date(y, m - 2, 1));
}

// ---- Month-over-month comparison (Overview) ----

export type MonthFigures = {
  weeklyAllowance: number;
  totalIncome: number;
  totalFixed: number;
  goalsSaved: number;
};

export type CompareItem = { label: string; delta: number; invert: boolean };

export type MonthComparison = {
  thisName: string;
  prevName: string;
  weeks: number;
  prevWeeks: number;
  weeksChanged: boolean;
  weeklyDelta: number;
  poolDelta: number;
  /** The two headline figures moved in opposite directions. */
  opposed: boolean;
  changed: CompareItem[];
  unchangedNote: string | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * How this month compares with the one before it.
 *
 * Reports the weekly figure and the MONTHLY pool side by side, because
 * reporting only the weekly one is actively misleading: a month's pool is
 * divided by its own week count, so a 4-week month following a 5-week one
 * shows a higher weekly figure while actually holding less money. The card
 * used to say "weekly allowance changed from $416 to $477.25" in exactly that
 * situation, which reads as a raise when the month had $171 less in it.
 */
export function buildMonthComparison(args: {
  month: string; // 'YYYY-MM-01' being viewed
  weekStartsOn: number;
  now: MonthFigures;
  prev: MonthFigures;
}): MonthComparison {
  const { month, weekStartsOn, now, prev } = args;
  const prevMonth = monthBefore(month);
  const weeks = weeksInPeriod(month, weekStartsOn);
  const prevWeeks = weeksInPeriod(prevMonth, weekStartsOn);

  const weeklyDelta = round2(now.weeklyAllowance - prev.weeklyAllowance);
  const poolDelta = round2(now.weeklyAllowance * weeks - prev.weeklyAllowance * prevWeeks);

  // Only what actually moved earns a row. Rows reading "No change" took the
  // same space as the one that mattered, so nothing stood out.
  const candidates: CompareItem[] = [
    { label: 'Income', delta: round2(now.totalIncome - prev.totalIncome), invert: false },
    { label: 'Fixed bills', delta: round2(now.totalFixed - prev.totalFixed), invert: true },
    { label: 'Saved toward goals', delta: round2(now.goalsSaved - prev.goalsSaved), invert: false },
  ];
  const changed = candidates.filter((c) => c.delta !== 0);
  const still = candidates.filter((c) => c.delta === 0).map((c) => c.label.toLowerCase());
  const list =
    still.length === 3
      ? `${still[0]}, ${still[1]} and ${still[2]}`
      : still.length === 2
        ? `${still[0]} and ${still[1]}`
        : still[0];

  return {
    thisName: monthName(month),
    prevName: monthName(prevMonth),
    weeks,
    prevWeeks,
    weeksChanged: weeks !== prevWeeks,
    weeklyDelta,
    poolDelta,
    opposed: weeklyDelta !== 0 && poolDelta !== 0 && weeklyDelta > 0 !== poolDelta > 0,
    changed,
    unchangedNote: still.length
      ? `${list.charAt(0).toUpperCase()}${list.slice(1)} ${still.length === 1 ? 'is' : 'are'} unchanged.`
      : null,
  };
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
