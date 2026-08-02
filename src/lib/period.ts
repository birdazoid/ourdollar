// Budget periods: whole weeks assigned to a calendar month.
//
// A month's spending pool is split across WEEKS, but calendar months don't
// contain a whole number of weeks, so "the month divided by 4" both leaves the
// 5th week of a long month unfunded and forces a week that straddles the
// boundary to belong to two months at once.
//
// A period fixes that. The period for month M runs from the first week-start
// day on or after the 1st of M, up to the day before the period for M+1. Every
// period is therefore exactly 4 or 5 whole weeks, periods tile the calendar
// with no gaps or overlaps, and a week is never split across two months.
//
// Bills, income, and month snapshots stay calendar-monthly. Only the way a
// month's pool is distributed into weeks changes.

import { todayISO } from '@/lib/week';

const MS_PER_WEEK = 7 * 86400000;

function toISODateLocal(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** 'YYYY-MM-01' for the month containing an ISO date. */
export function monthOf(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/**
 * First day of the budget period for a calendar month: the first week-start day
 * on or after the 1st. `monthStart` is 'YYYY-MM-01', `weekStartsOn` is 0 (Sun)
 * through 6 (Sat), matching households.week_start_day.
 */
export function periodStart(monthStart: string, weekStartsOn: number): string {
  const [y, m] = monthStart.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const forward = (weekStartsOn - first.getDay() + 7) % 7;
  const start = new Date(first);
  start.setDate(1 + forward);
  return toISODateLocal(start);
}

/** The next month's 'YYYY-MM-01', used to bound a period. */
function nextMonth(monthStart: string): string {
  const [y, m] = monthStart.split('-').map(Number);
  const d = new Date(y, m, 1); // m is 1-based, so this is the following month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export type Period = {
  month: string; // 'YYYY-MM-01' the period funds
  start: string; // first day, always a week-start day
  end: string; // last day, always the day before the next period
  weeks: number; // 4 or 5, always whole
};

/** The budget period for a calendar month. */
export function periodFor(monthStart: string, weekStartsOn: number): Period {
  const start = periodStart(monthStart, weekStartsOn);
  const nextStart = periodStart(nextMonth(monthStart), weekStartsOn);
  const endDate = new Date(`${nextStart}T00:00:00`);
  endDate.setDate(endDate.getDate() - 1);
  const weeks = Math.round(
    (new Date(`${nextStart}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()) / MS_PER_WEEK
  );
  return { month: monthStart, start, end: toISODateLocal(endDate), weeks };
}

/** How many whole weeks a month's pool is split across. Always 4 or 5. */
export function weeksInPeriod(monthStart: string, weekStartsOn: number): number {
  return periodFor(monthStart, weekStartsOn).weeks;
}

/** "Aug 3 to Sep 6" for a period, for labelling the plan. */
export function periodRangeLabel(p: Period): string {
  const short = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    return `${d.toLocaleDateString('en-US', { month: 'short' })} ${d.getDate()}`;
  };
  return `${short(p.start)} to ${short(p.end)}`;
}

/**
 * Which month's pool funds a given week.
 *
 * Every week in month M's period starts within month M, so this is just the
 * month of the week's start date. That holds because a period begins on the
 * FIRST week-start day of its month, and ends before the first week-start day
 * of the next, so no week inside it can start in a neighbouring month.
 */
export function fundingMonthForWeek(weekStartISO: string): string {
  return monthOf(weekStartISO);
}

/** The start date of the week containing an ISO date. */
export function weekStartFor(iso: string, weekStartsOn: number): string {
  const d = new Date(`${iso}T00:00:00`);
  const back = (d.getDay() - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - back);
  return toISODateLocal(d);
}

/**
 * Weeks left in the current period, counting the one in progress. Used to
 * spread a bill that came in over or under its estimate across the weeks that
 * are actually left, rather than the uneven day-of-month buckets this replaces.
 */
export function weeksRemainingInPeriod(weekStartsOn: number, today: string = todayISO()): number {
  const thisWeek = weekStartFor(today, weekStartsOn);
  const month = fundingMonthForWeek(thisWeek);
  const nextStart = periodStart(nextMonth(month), weekStartsOn);
  const left = Math.round(
    (new Date(`${nextStart}T00:00:00`).getTime() - new Date(`${thisWeek}T00:00:00`).getTime()) / MS_PER_WEEK
  );
  return Math.max(1, left);
}

/**
 * True during the days where the calendar month has rolled over but the budget
 * period has not, so the new month's bills are leaving the account while this
 * week is still funded by the previous month. Drives the Week screen's
 * boundary notice.
 */
export function isBoundaryWindow(weekStartsOn: number, today: string = todayISO()): boolean {
  return monthOf(today) !== fundingMonthForWeek(weekStartFor(today, weekStartsOn));
}
