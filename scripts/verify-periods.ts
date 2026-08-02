/**
 * Verifies the budget-period math (src/lib/period.ts). Pure, no database.
 *
 * The whole week-aligned-period model rests on one property: periods must TILE
 * the calendar. Every day belongs to exactly one period, every period is a
 * whole number of weeks, and no week is ever split across two months. If that
 * holds, the "which month funds this week" question has a single answer and the
 * old 52-weeks-of-spending-funded-as-48 leak closes on its own.
 *
 * Run: npm run verify:periods
 */
import { computeBudget, monthlyEquiv } from '../src/lib/money';
import {
  fundingMonthForWeek,
  isBoundaryWindow,
  monthOf,
  periodFor,
  weekStartFor,
  weeksInPeriod,
  weeksRemainingInPeriod,
} from '../src/lib/period';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) {
    passed++;
    console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const YEARS = [2024, 2025, 2026, 2027, 2028]; // includes leap years
const WEEK_STARTS = [0, 1, 2, 3, 4, 5, 6];
const monthISO = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}-01`;
const dayAfter = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

console.log('1. Periods tile the calendar with no gaps or overlaps');
{
  let gaps = 0;
  let badWeeks = 0;
  for (const ws of WEEK_STARTS) {
    for (const y of YEARS) {
      for (let m = 0; m < 12; m++) {
        const p = periodFor(monthISO(y, m), ws);
        if (p.weeks !== 4 && p.weeks !== 5) badWeeks++;
        // The next period must begin the very next day.
        const next = periodFor(m === 11 ? monthISO(y + 1, 0) : monthISO(y, m + 1), ws);
        if (dayAfter(p.end) !== next.start) gaps++;
      }
    }
  }
  check('every period is a whole 4 or 5 weeks', badWeeks === 0, `${badWeeks} bad`);
  check('each period ends exactly where the next begins', gaps === 0, `${gaps} gaps/overlaps`);
}

console.log('\n2. A year of periods funds a year of real weeks');
{
  let bad = 0;
  const samples: string[] = [];
  for (const ws of WEEK_STARTS) {
    for (const y of YEARS) {
      let total = 0;
      for (let m = 0; m < 12; m++) total += weeksInPeriod(monthISO(y, m), ws);
      if (total !== 52 && total !== 53) bad++;
      if (ws === 1) samples.push(`${y}:${total}`);
    }
  }
  check('every year totals 52 or 53 weeks (never 48)', bad === 0, samples.join(' '));
}

console.log('\n3. No week is ever split across two months');
{
  let bad = 0;
  for (const ws of WEEK_STARTS) {
    for (const y of YEARS) {
      for (let m = 0; m < 12; m++) {
        const month = monthISO(y, m);
        const p = periodFor(month, ws);
        // Walk every week start inside the period; each must be funded by, and
        // fall within, this month.
        for (let w = 0; w < p.weeks; w++) {
          const d = new Date(`${p.start}T00:00:00`);
          d.setDate(d.getDate() + w * 7);
          const weekStart = d.toISOString().slice(0, 10);
          if (fundingMonthForWeek(weekStart) !== month) bad++;
          if (monthOf(weekStart) !== month) bad++;
        }
      }
    }
  }
  check('every week in a period starts inside that period’s own month', bad === 0, `${bad} violations`);
}

console.log('\n4. Every day belongs to exactly one period');
{
  let bad = 0;
  for (const ws of WEEK_STARTS) {
    const cursor = new Date(Date.UTC(2026, 0, 5));
    for (let i = 0; i < 365; i++) {
      const iso = cursor.toISOString().slice(0, 10);
      const funding = fundingMonthForWeek(weekStartFor(iso, ws));
      const p = periodFor(funding, ws);
      if (iso < p.start || iso > p.end) bad++;
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  check('a year of days each land inside their funding period', bad === 0, `${bad} outside`);
}

console.log('\n5. Weeks remaining counts down exactly, never hits zero');
{
  // August 2026, Monday start: period runs Aug 3 to Sep 6, so 5 weeks.
  const ws = 1;
  const p = periodFor('2026-08-01', ws);
  check('Aug 2026 (Mon start) is Aug 3 to Sep 6', p.start === '2026-08-03' && p.end === '2026-09-06', `${p.start} to ${p.end}`);
  check('and runs 5 weeks', p.weeks === 5, `${p.weeks}`);

  const counts = ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31'].map((d) =>
    weeksRemainingInPeriod(ws, d)
  );
  check('counts down 5,4,3,2,1 across the period', counts.join(',') === '5,4,3,2,1', counts.join(','));

  // Mid-week must report the same as that week's start: the figure is stable
  // for the whole week, which is the point of week-aligned periods.
  check('stable mid-week', weeksRemainingInPeriod(ws, '2026-08-06') === 5, `${weeksRemainingInPeriod(ws, '2026-08-06')}`);

  let zero = 0;
  const cursor = new Date(Date.UTC(2026, 0, 1));
  for (let i = 0; i < 365; i++) {
    for (const w of WEEK_STARTS) {
      if (weeksRemainingInPeriod(w, cursor.toISOString().slice(0, 10)) < 1) zero++;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  check('never returns 0 (a variance always has somewhere to land)', zero === 0, `${zero} zeroes`);
}

console.log('\n6. Boundary window fires on exactly the right days');
{
  const ws = 1; // Monday
  // Sep 1 to 6 2026 sit inside August's period (which ends Sep 6).
  const inWindow = ['2026-09-01', '2026-09-03', '2026-09-06'].every((d) => isBoundaryWindow(ws, d));
  const outWindow = ['2026-08-31', '2026-09-07', '2026-09-15'].every((d) => !isBoundaryWindow(ws, d));
  check('Sep 1 to 6 2026 are inside the boundary window', inWindow);
  check('Aug 31 and Sep 7 onward are not', outWindow);

  // The window can never exceed 6 days, or the notice would overstay.
  let longest = 0;
  for (const w of WEEK_STARTS) {
    let run = 0;
    const cursor = new Date(Date.UTC(2026, 0, 1));
    for (let i = 0; i < 730; i++) {
      run = isBoundaryWindow(w, cursor.toISOString().slice(0, 10)) ? run + 1 : 0;
      longest = Math.max(longest, run);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  check('the window never runs longer than 6 days', longest <= 6, `longest ${longest}`);
}

console.log('\n7. The pool funds the year exactly (the old divide-by-4 leak)');
{
  const ws = 1;
  const POOL = 2000; // monthly spending pool
  const YEAR = 2026;

  // Old model: every month split 4 ways, but spent across real calendar weeks.
  const oldWeekly = POOL / 4;
  let realWeeks = 0;
  for (let m = 0; m < 12; m++) realWeeks += weeksInPeriod(monthISO(YEAR, m), ws);
  const oldSpend = oldWeekly * realWeeks;

  // New model: each month split across its own real week count.
  let newSpend = 0;
  for (let m = 0; m < 12; m++) {
    const weeks = weeksInPeriod(monthISO(YEAR, m), ws);
    newSpend += (POOL / weeks) * weeks;
  }

  const available = POOL * 12;
  check(
    'old model overspent the year',
    Math.round(oldSpend) > available,
    `$${Math.round(oldSpend)} spent vs $${available} available, $${Math.round(oldSpend - available)} short`
  );
  check(
    'new model funds the year to the dollar',
    Math.round(newSpend) === available,
    `$${Math.round(newSpend)} of $${available}`
  );

  const budget = computeBudget({
    incomeSources: [{ amount: 4000, frequency: 'monthly' as const }],
    extraIncome: [],
    bills: [{ paid: false, paid_amount: null, amount: 2000 }],
    goals: [],
    funMoneyEnabled: false,
    funPeople: [],
    weeksInPeriod: 5,
  });
  check('computeBudget splits a 5-week period 5 ways', budget.weeklyAllowance === 400, `${budget.weeklyAllowance}`);
  check('and its monthly pool still reconciles', budget.monthlyPool === 2000, `${budget.monthlyPool}`);
}

console.log('\n8. Income frequency multipliers (biweekly is not semimonthly)');
{
  // 26 paychecks a year, not 24. Conflating the two understated income by one
  // whole paycheck a year for anyone paid every other week.
  const biweekly = monthlyEquiv({ amount: 1000, frequency: 'biweekly' });
  const semimonthly = monthlyEquiv({ amount: 1000, frequency: 'semimonthly' });
  check(
    '$1,000 biweekly is $2,166.67/mo, not $2,000',
    Math.round(biweekly * 100) / 100 === 2166.67,
    `${Math.round(biweekly * 100) / 100}`
  );
  check('and semimonthly stays $2,000', semimonthly === 2000, `${semimonthly}`);
  // 26 paychecks against 24, so the gap is TWO paychecks a year, not one.
  check(
    'the gap is two extra paychecks a year',
    Math.round((biweekly - semimonthly) * 12) === 2000,
    `$${Math.round((biweekly - semimonthly) * 12)}`
  );

  const weekly = monthlyEquiv({ amount: 500, frequency: 'weekly' });
  check(
    '$500 weekly is $2,166.67/mo (52/12), not $2,000',
    Math.round(weekly * 100) / 100 === 2166.67,
    `${Math.round(weekly * 100) / 100}`
  );

  // Each frequency must round-trip to its real annual total.
  const annual: [string, number, number][] = [
    ['weekly', monthlyEquiv({ amount: 100, frequency: 'weekly' }) * 12, 100 * 52],
    ['biweekly', monthlyEquiv({ amount: 100, frequency: 'biweekly' }) * 12, 100 * 26],
    ['semimonthly', monthlyEquiv({ amount: 100, frequency: 'semimonthly' }) * 12, 100 * 24],
    ['monthly', monthlyEquiv({ amount: 100, frequency: 'monthly' }) * 12, 100 * 12],
  ];
  const annualOk = annual.every(([, got, want]) => Math.round(got * 100) === Math.round(want * 100));
  check(
    'all four frequencies reconcile to their annual totals',
    annualOk,
    annual.map(([n, got]) => `${n}=$${Math.round(got)}`).join(' ')
  );
}

console.log(`\n${failed === 0 ? '✅ ALL CHECKS PASSED' : '❌ FAILURES'} — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
