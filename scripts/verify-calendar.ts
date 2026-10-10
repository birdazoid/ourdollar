/**
 * Calendar edges the app's weeks and months have to survive: every week-start
 * day across a whole year (including both daylight-saving changes and the
 * year end), week labels that cross a month or a year, bills due on days a
 * short month doesn't have, and the month review for a brand-new household.
 *
 * Pure date maths, no database. Run: npm run verify:calendar
 * Uses the machine's own time zone, which is what the phone does too.
 */
import { pendingReviewMonth } from '../src/lib/month-review';
import { dueDayInMonth, fundingMonthForWeek, monthOf } from '../src/lib/period';
import { getWeek, weekRangeLabel } from '../src/lib/week';

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (s: string, n: number) => {
  const d = new Date(`${s}T12:00:00`);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const weekday = (s: string) => new Date(`${s}T12:00:00`).getDay();

console.log('\nA. Every day of 2026, for every week-start day');
{
  let bad = '';
  for (let start = 0; start < 7 && !bad; start++) {
    for (let day = '2026-01-01'; day <= '2026-12-31' && !bad; day = addDays(day, 1)) {
      const w = getWeek(0, start, day);
      const dates = w.days.map((d: { date: string }) => d.date);
      const consecutive = dates.every((d: string, i: number) => i === 0 || d === addDays(dates[i - 1], 1));
      if (dates.length !== 7) bad = `${day} start ${start}: ${dates.length} days`;
      else if (!consecutive) bad = `${day} start ${start}: not consecutive ${dates.join(',')}`;
      else if (!dates.includes(day)) bad = `${day} start ${start}: today missing`;
      else if (weekday(dates[0]) !== start) bad = `${day} start ${start}: starts on day ${weekday(dates[0])}`;
      else if (w.start !== dates[0]) bad = `${day} start ${start}: start ${w.start} vs first day ${dates[0]}`;
    }
  }
  check('each week is 7 consecutive days, holds today, starts on the chosen day', bad === '', bad);
}

console.log('\nB. Paging back a week');
{
  let bad = '';
  for (let start = 0; start < 7 && !bad; start++) {
    for (let day = '2026-01-01'; day <= '2026-12-31' && !bad; day = addDays(day, 3)) {
      const now = getWeek(0, start, day);
      const prev = getWeek(-1, start, day);
      if (prev.start !== addDays(now.start, -7)) bad = `${day} start ${start}: ${prev.start} vs ${now.start}`;
    }
  }
  check('last week always starts exactly 7 days earlier', bad === '', bad);
}

console.log('\nC. Daylight-saving and year-end weeks');
{
  // US clocks change on Mar 8 and Nov 1 2026.
  for (const day of ['2026-03-08', '2026-03-09', '2026-11-01', '2026-11-02']) {
    const dates = getWeek(0, 0, day).days.map((d: { date: string }) => d.date);
    check(`week of ${day} has no repeated or skipped day`, new Set(dates).size === 7, dates.join(' '));
  }
  const ny = getWeek(0, 0, '2026-12-31');
  check('the week of Dec 31 runs into the new year', ny.days[6].date === '2027-01-02', ny.days.map((d: { date: string }) => d.date).join(' '));
  check('the next week after it is in 2027', getWeek(1, 0, '2026-12-31').start === '2027-01-03', getWeek(1, 0, '2026-12-31').start);
}

console.log('\nD. Week labels across months and years');
{
  const cross = weekRangeLabel(getWeek(0, 0, '2026-09-30').days);
  check('a week crossing into October names both months', /Sep/.test(cross) && /Oct/.test(cross), cross);
  const year = weekRangeLabel(getWeek(0, 0, '2026-12-31').days);
  check('a week crossing the year names both ends', /Dec/.test(year) && /Jan/.test(year), year);
  const inside = weekRangeLabel(getWeek(0, 0, '2026-10-07').days);
  check('a week inside one month names it', /Oct/.test(inside), inside);
}

console.log('\nE. A week crossing a month is funded by one month');
{
  const w = getWeek(0, 0, '2026-09-30');
  check('funded by the month it starts in', fundingMonthForWeek(w.start) === monthOf(w.start), `${w.start} -> ${fundingMonthForWeek(w.start)}`);
}

console.log('\nF. Bills due on days a short month lacks');
check('the 31st in September is the 30th', dueDayInMonth(31, '2026-09-15') === 30);
check('the 31st in February 2026 is the 28th', dueDayInMonth(31, '2026-02-10') === 28);
check('the 30th in February 2028 (leap year) is the 29th', dueDayInMonth(30, '2028-02-10') === 29);
check('the 15th stays the 15th', dueDayInMonth(15, '2026-02-10') === 15);
check('no due day stays none', dueDayInMonth(null, '2026-02-10') === null);
{
  // On Feb 28, a bill due "the 31st" is due today, not "in the next 7 days".
  const todayDay = 28;
  const due = dueDayInMonth(31, '2026-02-28')!;
  check('on Feb 28 a 31st bill is due today', due === todayDay);
}

console.log('\nG. Month review for a brand-new household');
{
  const now = new Date('2026-10-10T12:00:00');
  check(
    'created this month: nothing to review yet',
    pendingReviewMonth('2026-10-02T09:00:00Z', [], now) === null,
    String(pendingReviewMonth('2026-10-02T09:00:00Z', [], now))
  );
  check(
    'created last month: last month is due for review',
    pendingReviewMonth('2026-09-20T09:00:00Z', [], now) === '2026-09-01',
    String(pendingReviewMonth('2026-09-20T09:00:00Z', [], now))
  );
  check(
    'already reviewed: nothing pending',
    pendingReviewMonth('2026-09-20T09:00:00Z', ['2026-09-01'], now) === null,
    String(pendingReviewMonth('2026-09-20T09:00:00Z', ['2026-09-01'], now))
  );
}

console.log(`\n${fail === 0 ? '✅ ALL CHECKS PASSED' : '❌ SOME CHECKS FAILED'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
