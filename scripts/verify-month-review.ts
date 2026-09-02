/**
 * Verifies the end-of-month review feature:
 *   Part A — pure helpers (month-review.ts): pendingReviewMonth gating, and
 *     weekBucketsInMonth's calendar-clipped bucketing.
 *   Part B — live DB: the full close-month flow (mirrors useCloseMonth exactly
 *     — plan+bills snapshot, auto-carryover for unpaid bills, bulk reset), the
 *     unique-per-month guard, and the resolve_carryover RPC's retroactive
 *     credit — paying a carried-over bill later must credit the ORIGINAL
 *     month's snapshot, not silently vanish, and dismissing must NOT credit
 *     anything. Also RLS isolation on the RPC itself.
 *
 * Run: npm run verify:month-review   (needs .env.seed + .env like the others)
 * Needs migration 20260719000015_month_snapshots_broaden.sql applied.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

import { describeDelta } from '../src/lib/money';
import {
  buildMonthComparison,
  monthName,
  monthStartISO,
  pendingReviewMonth,
  weekBucketsInMonth,
} from '../src/lib/month-review';

loadEnv({ path: '.env.seed' });
loadEnv({ path: '.env' });

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error('Missing env. Need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.seed, and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env.');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const PASSWORD = 'ourdollar-review-pw-1';
const stamp = Date.now();
const U1 = `ourdollar-review+owner-${stamp}@example.com`;
const U2 = `ourdollar-review+stranger-${stamp}@example.com`;

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  ✅' : '  ❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}
async function makeUser(email: string) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  return data.user!.id;
}
async function signIn(email: string): Promise<SupabaseClient> {
  const c = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return c;
}

function pureChecks() {
  console.log('\nA. Pure helpers');

  const now = new Date(2026, 6, 15); // Jul 15 2026 (local)
  const createdThisMonth = new Date(2026, 6, 1).toISOString();
  check(
    'brand-new household (created this month) has nothing pending',
    pendingReviewMonth(createdThisMonth, [], now) === null
  );

  const createdEarlier = new Date(2026, 4, 10).toISOString(); // May 10
  const pending = pendingReviewMonth(createdEarlier, [], now);
  check('older household has June pending', pending === '2026-06-01', `got ${pending}`);

  const caughtUp = pendingReviewMonth(createdEarlier, ['2026-06-01'], now);
  check('already-reviewed month is not pending again', caughtUp === null);

  const buckets = weekBucketsInMonth('2026-07-01', 0);
  check('first bucket clipped to the 1st', buckets[0].clippedStart === '2026-07-01', buckets[0].clippedStart);
  check('last bucket clipped to the 31st', buckets[buckets.length - 1].clippedEnd === '2026-07-31', buckets[buckets.length - 1].clippedEnd);
  const covered = new Set<string>();
  for (const b of buckets) {
    let d = new Date(`${b.clippedStart}T00:00:00`);
    const end = new Date(`${b.clippedEnd}T00:00:00`);
    while (d <= end) {
      covered.add(monthStartISO(d) === '2026-07-01' ? d.toISOString().slice(0, 10) : 'OUT');
      d = new Date(d.getTime() + 86400000);
    }
  }
  check('buckets cover all 31 days of July with no leakage', covered.size === 31 && !covered.has('OUT'), `covered ${covered.size}`);

  comparisonChecks();
  billsTrendChecks();
  deltaWordingChecks();
}

/**
 * Overview and the month review each wrote their own change-wording and
 * drifted: one said "$99 more", the other "↑ $99" for the same comparison.
 * Both now go through describeDelta, so its contract is pinned here.
 */
function deltaWordingChecks() {
  console.log('\nA3. Change wording (describeDelta)');

  const up = describeDelta(99);
  check('a rise reads in words', up.text === '$99 more', up.text);
  check('a rise in income is good', up.good);

  const upBills = describeDelta(99, { invert: true });
  check('the same rise in bills is not', !upBills.good);
  check('but reads identically', upBills.text === '$99 more', upBills.text);

  const down = describeDelta(-40, { invert: true });
  check('a fall in bills reads as less, and is good', down.text === '$40 less' && down.good, down.text);

  // The bug the arrow form had: `delta <= 0` treated nothing as a decrease, so
  // an unchanged month rendered "↓ $0".
  const flat = describeDelta(0);
  check('zero says No change, not "$0 less"', flat.text === 'No change', flat.text);
  check('zero is flagged flat so it renders muted, not green', flat.flat && flat.good);
  check('a rounding-dust delta is still flat', describeDelta(0.004).flat, describeDelta(0.004).text);

  check('cents survive when they matter', describeDelta(61.25).text === '$61.25 more', describeDelta(61.25).text);
  check('whole dollars stay clean', describeDelta(-171).text === '$171 less', describeDelta(-171).text);

  // The month label the deltas are suffixed with drops the year, matching the
  // comparison card ("vs July", not "vs July 2026").
  check('month name drops the year', monthName('2026-07-01') === 'July', monthName('2026-07-01'));
}

/**
 * Regression guard for the month comparison card.
 *
 * The reported bug, verbatim: a Friday-start household saw "Weekly allowance
 * changed from $416 to $477.25" going from July into August 2026. That reads
 * as a raise. July ran 5 weeks and August runs 4, so the pool actually fell
 * from $2,080 to $1,909. The card has to report both figures, and has to
 * notice when they point in opposite directions.
 */
function comparisonChecks() {
  console.log('\nA2. Month comparison (buildMonthComparison)');

  const reported = buildMonthComparison({
    month: '2026-08-01',
    weekStartsOn: 5, // Friday
    now: { weeklyAllowance: 477.25, totalIncome: 8504, totalFixed: 6535, goalsSaved: 0 },
    prev: { weeklyAllowance: 416, totalIncome: 8504, totalFixed: 6436, goalsSaved: 0 },
  });

  check('August is 4 weeks, July was 5', reported.weeks === 4 && reported.prevWeeks === 5, `${reported.weeks} vs ${reported.prevWeeks}`);
  check('weekly is up $61.25', reported.weeklyDelta === 61.25, `got ${reported.weeklyDelta}`);
  check('the MONTH is down $171', reported.poolDelta === -171, `got ${reported.poolDelta}`);
  check('the two figures are flagged as opposed', reported.opposed, 'weekly up while the month shrank');
  check('the week-count change is flagged', reported.weeksChanged);
  // Every row is reported now, movement or not, each carrying its own figure.
  // The card used to drop the steady ones and summarise them in a sentence,
  // which meant "$99 more" never said more than WHAT — and a household whose
  // bills held steady lost the total from the card altogether.
  check('all three rows are reported', reported.items.length === 3, JSON.stringify(reported.items.map((i) => i.label)));

  const billsRow = reported.items.find((i) => i.label === 'Fixed bills');
  check('the bills row still carries its movement', billsRow?.delta === 99, `got ${billsRow?.delta}`);
  check('and now carries the figure itself', billsRow?.value === 6535, `got ${billsRow?.value}`);
  // A rise in bills is bad news, unlike a rise in income — this is what
  // colours it terracotta instead of green.
  check('and is still marked as one where up is bad', billsRow?.invert === true);

  const incomeRow = reported.items.find((i) => i.label === 'Income');
  check('a steady row survives instead of vanishing', !!incomeRow && incomeRow.delta === 0);
  check('and still shows what income actually is', incomeRow?.value === 8504, `got ${incomeRow?.value}`);

  const goalsRow = reported.items.find((i) => i.label === 'Saved toward goals');
  check('the goals row reports its own total', goalsRow?.value === 0 && goalsRow?.delta === 0);

  // Every value must be the CURRENT month's figure, never the previous one.
  // Reading them off `prev` would be invisible whenever nothing moved.
  check(
    'every value comes from the month being viewed',
    reported.items.every((i) =>
      i.label === 'Income' ? i.value === 8504 : i.label === 'Fixed bills' ? i.value === 6535 : i.value === 0
    ),
    JSON.stringify(reported.items)
  );

  // Same week count both months: the two deltas must agree in direction, and
  // there's no week-count story to tell.
  const steady = buildMonthComparison({
    month: '2026-09-01', // 4 weeks, and August before it is also 4
    weekStartsOn: 5,
    now: { weeklyAllowance: 500, totalIncome: 8504, totalFixed: 6535, goalsSaved: 100 },
    prev: { weeklyAllowance: 450, totalIncome: 8504, totalFixed: 6535, goalsSaved: 100 },
  });
  check('equal week counts raise no week note', !steady.weeksChanged, `${steady.weeks} vs ${steady.prevWeeks}`);
  check('equal week counts are never "opposed"', !steady.opposed);
  check('both deltas move together', steady.weeklyDelta > 0 && steady.poolDelta > 0, `${steady.weeklyDelta} / ${steady.poolDelta}`);

  // Nothing moved at all.
  const flat = buildMonthComparison({
    month: '2026-09-01', // 4 weeks, and August before it is also 4
    weekStartsOn: 5,
    now: { weeklyAllowance: 450, totalIncome: 8504, totalFixed: 6535, goalsSaved: 100 },
    prev: { weeklyAllowance: 450, totalIncome: 8504, totalFixed: 6535, goalsSaved: 100 },
  });
  // The case that motivated the change: nothing moved, so the old card showed
  // no figures at all and the household could not see what their bills were.
  check('a flat month still reports all three rows', flat.items.length === 3);
  check('all of them read as no change', flat.items.every((i) => i.delta === 0));
  check(
    'and every figure is still there to read',
    flat.items.find((i) => i.label === 'Fixed bills')?.value === 6535 &&
      flat.items.find((i) => i.label === 'Income')?.value === 8504 &&
      flat.items.find((i) => i.label === 'Saved toward goals')?.value === 100,
    JSON.stringify(flat.items)
  );
}

/**
 * The bills trend series on Overview: what fixed bills cost each month.
 *
 * Bills reset at month close, so a closed month's snapshot is the only record
 * that survives. The distinction this pins is between a month with no snapshot
 * and a month that genuinely cost nothing — the first must be null so the
 * chart leaves a gap, because drawing $0 would claim the household paid no
 * bills at all that month.
 */
function billsTrendChecks() {
  console.log('\nA3. Bills trend series');

  // Mirrors the builder in overview.tsx: snapshots for closed months, the live
  // plan for the current one, null for anything unrecorded.
  const build = (args: {
    snapshots: { month: string; total_fixed: number }[];
    liveTotalFixed: number;
    months: string[]; // 'YYYY-MM', oldest first, last one being "this month"
  }) => {
    const byMonth: Record<string, number> = {};
    args.snapshots.forEach((s) => {
      byMonth[s.month.slice(0, 7)] = s.total_fixed;
    });
    const thisMonth = args.months[args.months.length - 1];
    return args.months.map((m) => (m === thisMonth ? args.liveTotalFixed : byMonth[m] ?? null));
  };

  const snapshots = [
    { month: '2026-07-01', total_fixed: 6436 },
    { month: '2026-08-01', total_fixed: 6778 },
  ];

  const three = build({ snapshots, liveTotalFixed: 6092, months: ['2026-07', '2026-08', '2026-09'] });
  check('closed months come from their snapshot', three[0] === 6436 && three[1] === 6778, JSON.stringify(three));
  check('the current month comes from the live plan', three[2] === 6092, `got ${three[2]}`);
  // The $686 the household saw on the comparison card is exactly this gap.
  check('the drop matches the comparison card', (three[1] as number) - (three[2] as number) === 686, `${three[1]} - ${three[2]}`);

  const wide = build({
    snapshots,
    liveTotalFixed: 6092,
    months: ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'],
  });
  check('months before any snapshot are null, not zero', wide.slice(0, 3).every((v) => v === null), JSON.stringify(wide));
  check('and the recorded ones are unaffected', wide[3] === 6436 && wide[4] === 6778 && wide[5] === 6092);
  // A null must never be read as a number anywhere downstream.
  check('nulls are absent from the recorded count', wide.filter((v) => v != null).length === 3);

  // A brand-new household: nothing closed yet, so only the live month has a
  // figure. The chart says so rather than drawing a lone bar with no context.
  const fresh = build({ snapshots: [], liveTotalFixed: 6092, months: ['2026-07', '2026-08', '2026-09'] });
  check('a household with no closed months has one figure', fresh.filter((v) => v != null).length === 1);
  check('and it is the live one', fresh[2] === 6092);

  // A month that genuinely cost nothing is still a real, recorded zero, and
  // must be drawn as a bar rather than treated as missing.
  const zero = build({
    snapshots: [{ month: '2026-07-01', total_fixed: 0 }],
    liveTotalFixed: 6092,
    months: ['2026-07', '2026-08', '2026-09'],
  });
  check('a real $0 month is recorded, not a gap', zero[0] === 0 && zero[0] !== null, JSON.stringify(zero));
  check('while the unrecorded month beside it stays null', zero[1] === null);
}

async function dbChecks() {
  console.log('\nB. Live DB');
  const u1Id = await makeUser(U1);
  const u2Id = await makeUser(U2);
  const u1 = await signIn(U1);
  const u2 = await signIn(U2);

  try {
    const { data: h } = await u1.from('households').insert({ name: 'Review Home', owner_account_id: u1Id }).select().single();
    const hid = h!.id as string;
    const { data: m } = await u1
      .from('household_members')
      .insert({ household_id: hid, account_id: u1Id, name: 'Owner', is_admin: true, has_account: true })
      .select()
      .single();
    await u1.from('fun_money_settings').insert({ household_id: hid, enabled: false });

    const { data: rentBill } = await u1
      .from('bills')
      .insert({ household_id: hid, name: 'Rent', category: 'Housing', amount: 1500, due_day: 1, varies: false, paid: false })
      .select()
      .single();
    const { data: gymBill } = await u1
      .from('bills')
      .insert({ household_id: hid, name: 'Gym', category: 'Other', amount: 40, due_day: 5, varies: false, paid: true, paid_amount: 40, paid_on: '2026-06-05' })
      .select()
      .single();
    // Estimated low and paid high — the reported OG&E case ($421 est / $483
    // actual). Closing the month must promote the actual to the estimate.
    const { data: electricBill } = await u1
      .from('bills')
      .insert({ household_id: hid, name: 'Electric', category: 'Utilities', amount: 421, due_day: 20, varies: false, paid: true, paid_amount: 483, paid_on: '2026-06-20' })
      .select()
      .single();

    // A goal mid-contribution: paid_this_month must be cleared by the close,
    // or the contribute action stays hidden forever (bug found in review).
    const { data: goal } = await u1
      .from('goals')
      .insert({ household_id: hid, name: 'Trip', target_amount: 1000, monthly_amount: 100, saved_amount: 100, paid_this_month: true })
      .select()
      .single();
    // A varies-amount bill (no fixed amount) — the case where "mark paid" used
    // to be indistinguishable from "dismiss".
    await u1
      .from('bills')
      .insert({ household_id: hid, name: 'Water', category: 'Bills & Utilities', amount: null, due_day: 9, varies: true, paid: false });

    const MONTH = '2026-06-01';

    console.log('\n1. close_month() — one atomic call does everything');
    const { data: closeRes, error: closeErr } = await u1.rpc('close_month', {
      p_household_id: hid,
      p_month: MONTH,
      p_total_income: 5000,
      p_total_fixed: 1540,
      p_goals_monthly: 100,
      p_goals_saved_total: 100,
      p_fun_total: 80,
      p_weekly_allowance: 300,
    });
    check('close_month returns "closed"', !closeErr && closeRes === 'closed', closeErr?.message ?? `got ${closeRes}`);

    const { data: snap } = await u1.from('month_snapshots').select('*').eq('household_id', hid).eq('month', MONTH).single();
    // Gym paid $40 and Electric paid $483 (est. $421); Rent ($1500) + Water
    // (varies, null) were unpaid. Paid totals use the ACTUAL, not the estimate.
    check('snapshot derived bills_paid_amount = 523', Number(snap?.bills_paid_amount) === 523, `got ${snap?.bills_paid_amount}`);
    check('snapshot derived bills_total_amount = 2023 (null amount counts as 0)', Number(snap?.bills_total_amount) === 2023, `got ${snap?.bills_total_amount}`);
    check('snapshot derived counts 2 paid / 4 total', snap?.bills_paid_count === 2 && snap?.bills_total_count === 4, `got ${snap?.bills_paid_count}/${snap?.bills_total_count}`);
    check('snapshot kept the client-supplied plan figures', Number(snap?.total_income) === 5000 && Number(snap?.weekly_allowance) === 300);

    const { data: billsAfter } = await u1.from('bills').select('name, paid, paid_amount, amount').eq('household_id', hid);
    check('every bill reset for the fresh cycle', (billsAfter ?? []).every((b) => b.paid === false && b.paid_amount === null));

    // Carry-forward: next month is planned against what bills actually cost.
    const electricAfter = (billsAfter ?? []).find((b) => b.name === 'Electric');
    check(
      'a bill paid over its estimate carries the actual forward (421 → 483)',
      Number(electricAfter?.amount) === 483,
      `got ${electricAfter?.amount}`
    );
    const gymAfter = (billsAfter ?? []).find((b) => b.name === 'Gym');
    check('a bill paid exactly at estimate is left alone', Number(gymAfter?.amount) === 40, `got ${gymAfter?.amount}`);
    const waterAfter = (billsAfter ?? []).find((b) => b.name === 'Water');
    check(
      'a varies bill stays estimate-less (not silently turned into a fixed bill)',
      waterAfter?.amount === null,
      `got ${waterAfter?.amount}`
    );
    check(
      'the closed month keeps its own history (snapshot still has the actual)',
      Number(snap?.bills_paid_amount) === 523,
      `got ${snap?.bills_paid_amount}`
    );

    const { data: goalAfter } = await u1.from('goals').select('paid_this_month').eq('id', goal!.id).single();
    check('BUGFIX: goals.paid_this_month cleared by the close', goalAfter?.paid_this_month === false, `got ${goalAfter?.paid_this_month}`);

    const { data: autoCarry } = await u1.from('bill_carryovers').select('name, amount').eq('household_id', hid).eq('from_month', MONTH);
    check('unpaid bills auto-flagged as carryovers (Rent + Water)', (autoCarry ?? []).length === 2, `got ${(autoCarry ?? []).length}`);

    // ---- per-bill history ----
    // The reset above has already wiped paid/paid_amount and promoted 421 to
    // 483, so if these lines weren't captured before it, June's per-bill
    // outcome would be gone for good. Everything below reads what survived.
    const { data: lines } = await u1
      .from('bill_month_lines')
      .select('*')
      .eq('household_id', hid)
      .eq('month', MONTH);
    const line = (name: string) => (lines ?? []).find((l: any) => l.name === name);
    check('a line was written for every bill', (lines ?? []).length === 4, `got ${(lines ?? []).length}`);

    // The whole point: the estimate and the actual are BOTH kept, so "$62 more
    // than we planned" stays answerable after the bill row has moved on.
    check(
      'the over-estimate bill kept both figures (est 421, actual 483)',
      Number(line('Electric')?.estimate) === 421 && Number(line('Electric')?.actual) === 483,
      JSON.stringify(line('Electric'))
    );
    check(
      'and the bill row itself has already moved on to 483',
      Number(electricAfter?.amount) === 483,
      `got ${electricAfter?.amount}`
    );
    check('a bill paid at estimate records the same figure twice', Number(line('Gym')?.estimate) === 40 && Number(line('Gym')?.actual) === 40);
    check('and is recorded as paid', line('Gym')?.paid === true);

    // An unpaid bill's "actual" is its estimate — the same rule
    // billMonthlyCost() follows, so a line and the snapshot total it fed are
    // always derived the same way.
    check('an unpaid bill falls back to its estimate', Number(line('Rent')?.actual) === 1500 && line('Rent')?.paid === false);
    // A varies bill with no estimate has nothing honest to record, so it
    // records nothing rather than a zero that would read as "cost nothing".
    check('a varies bill with no estimate records null, not 0', line('Water')?.estimate === null && line('Water')?.actual === null, JSON.stringify(line('Water')));

    // Name and category are copied, not joined: renaming a bill later must not
    // rewrite what June's record says it was.
    check('the line copies name and category', line('Electric')?.category === 'Utilities');
    await u1.from('bills').update({ name: 'Electric (OG&E)' }).eq('id', electricBill!.id);
    const { data: afterRename } = await u1
      .from('bill_month_lines')
      .select('name')
      .eq('household_id', hid)
      .eq('month', MONTH)
      .eq('bill_id', electricBill!.id)
      .single();
    check('renaming the bill does not rewrite history', afterRename?.name === 'Electric', `got ${afterRename?.name}`);
    await u1.from('bills').update({ name: 'Electric' }).eq('id', electricBill!.id);

    // The lines must add up to the total the snapshot recorded, or the chart
    // and the breakdown explaining it would disagree.
    const linesTotal = (lines ?? []).reduce((a: number, l: any) => a + Number(l.actual ?? 0), 0);
    check(
      'the lines sum to the snapshot total (2023)',
      linesTotal === Number(snap?.bills_total_amount),
      `${linesTotal} vs ${snap?.bills_total_amount}`
    );

    console.log('\n2. close_month is idempotent + authorization-checked');
    const { data: reclose } = await u1.rpc('close_month', {
      p_household_id: hid, p_month: MONTH, p_total_income: 9999, p_total_fixed: 0,
      p_goals_monthly: 0, p_goals_saved_total: 0, p_fun_total: 0, p_weekly_allowance: 0,
    });
    check('re-closing returns "already-closed"', reclose === 'already-closed', `got ${reclose}`);
    const { data: carryStill } = await u1.from('bill_carryovers').select('id').eq('household_id', hid).eq('from_month', MONTH);
    check('re-closing did NOT duplicate carryovers', (carryStill ?? []).length === 2, `got ${(carryStill ?? []).length}`);
    const { data: snapUnchanged } = await u1.from('month_snapshots').select('total_income').eq('household_id', hid).eq('month', MONTH).single();
    check('re-closing did NOT overwrite the snapshot', Number(snapUnchanged?.total_income) === 5000, `got ${snapUnchanged?.total_income}`);
    const { data: linesStill } = await u1.from('bill_month_lines').select('id').eq('household_id', hid).eq('month', MONTH);
    check('re-closing did NOT duplicate the bill lines', (linesStill ?? []).length === 4, `got ${(linesStill ?? []).length}`);

    const { data: strangerClose } = await u2.rpc('close_month', {
      p_household_id: hid, p_month: '2026-05-01', p_total_income: 1, p_total_fixed: 0,
      p_goals_monthly: 0, p_goals_saved_total: 0, p_fun_total: 0, p_weekly_allowance: 0,
    });
    check('a stranger cannot close another household’s month', strangerClose === 'not-authorized', `got ${strangerClose}`);

    console.log('\n3. Retroactive credit — paying a carryover later credits ITS month');
    const { data: rentCo } = await u1.from('bill_carryovers').select('id').eq('household_id', hid).eq('name', 'Rent').eq('resolved', false).single();
    const { data: paidOk, error: resolveErr } = await u1.rpc('resolve_carryover', {
      p_carryover_id: rentCo!.id,
      p_mark_paid: true,
      p_paid_amount: 1500,
      p_settled_by_member_id: m!.id,
    });
    check('resolve_carryover (paid) succeeds', !resolveErr && paidOk === true, resolveErr?.message ?? `got ${paidOk}`);
    const { data: snapAfter } = await u1.from('month_snapshots').select('bills_paid_amount, bills_paid_count').eq('household_id', hid).eq('month', MONTH).single();
    check('June credited: paid_amount 523→2023', Number(snapAfter?.bills_paid_amount) === 2023, `got ${snapAfter?.bills_paid_amount}`);
    check('June credited: paid_count 2→3', snapAfter?.bills_paid_count === 3, `got ${snapAfter?.bills_paid_count}`);
    // The bill's own line has to be corrected too. Without this the per-bill
    // history would say "not paid" forever for a bill the month total counts
    // as paid — two records of one fact, disagreeing.
    const { data: rentLine } = await u1
      .from('bill_month_lines')
      .select('paid, actual')
      .eq('household_id', hid)
      .eq('month', MONTH)
      .eq('bill_id', rentBill!.id)
      .single();
    check('the bill line now reads as paid', rentLine?.paid === true, JSON.stringify(rentLine));
    check('and carries what was actually paid', Number(rentLine?.actual) === 1500, `got ${rentLine?.actual}`);

    console.log('\n4. BUGFIX: a varies-amount bill can be marked PAID (not silently dismissed)');
    const { data: waterCo } = await u1.from('bill_carryovers').select('id, amount').eq('household_id', hid).eq('name', 'Water').eq('resolved', false).single();
    check('the varies carryover really has a null amount', waterCo?.amount === null);
    const { data: variesPaid } = await u1.rpc('resolve_carryover', {
      p_carryover_id: waterCo!.id,
      p_mark_paid: true,
      p_paid_amount: null, // unknown — this used to be read as "dismissed"
      p_settled_by_member_id: m!.id,
    });
    check('marking a null-amount carryover paid succeeds', variesPaid === true, `got ${variesPaid}`);
    const { data: snapVaries } = await u1.from('month_snapshots').select('bills_paid_amount, bills_paid_count').eq('household_id', hid).eq('month', MONTH).single();
    check('paid COUNT credited for the unknown amount (3→4)', snapVaries?.bills_paid_count === 4, `got ${snapVaries?.bills_paid_count}`);
    check('paid AMOUNT unchanged (honest: amount is unknown)', Number(snapVaries?.bills_paid_amount) === 2023, `got ${snapVaries?.bills_paid_amount}`);
    // Same for the line: paid becomes true, but an unknown amount must not
    // overwrite the null with a zero that would read as "cost nothing".
    const { data: waterLines } = await u1
      .from('bill_month_lines')
      .select('name, paid, actual')
      .eq('household_id', hid)
      .eq('month', MONTH);
    const water = (waterLines ?? []).find((l: any) => l.name === 'Water');
    check('the varies line reads as paid', water?.paid === true, JSON.stringify(water));
    check('with its amount still unknown, not zeroed', water?.actual === null, `got ${water?.actual}`);

    console.log('\n5. Dismissing does NOT credit history');
    const { data: co2 } = await u1
      .from('bill_carryovers')
      .insert({ household_id: hid, bill_id: null, name: 'Streaming', category: 'Other', amount: 12, from_month: MONTH })
      .select()
      .single();
    const { data: dismissOk } = await u1.rpc('resolve_carryover', { p_carryover_id: co2!.id, p_mark_paid: false, p_paid_amount: null, p_settled_by_member_id: m!.id });
    check('resolve_carryover (dismiss) succeeds', dismissOk === true);
    const { data: dismissRow } = await u1.from('bill_carryovers').select('resolved, resolved_amount').eq('id', co2!.id).single();
    check('dismissed row resolved with NO amount', dismissRow?.resolved === true && dismissRow?.resolved_amount === null);
    const { data: snapAfterDismiss } = await u1.from('month_snapshots').select('bills_paid_amount, bills_paid_count').eq('household_id', hid).eq('month', MONTH).single();
    check('dismissal leaves paid totals unchanged', Number(snapAfterDismiss?.bills_paid_amount) === 2023 && snapAfterDismiss?.bills_paid_count === 4);

    console.log('\n6. Can’t double-resolve or resolve cross-household');
    const { data: doubleResolve } = await u1.rpc('resolve_carryover', { p_carryover_id: rentCo!.id, p_mark_paid: true, p_paid_amount: 999, p_settled_by_member_id: m!.id });
    check('re-resolving an already-resolved carryover is a no-op (false)', doubleResolve === false, `got ${doubleResolve}`);
    const { data: snapStillSame } = await u1.from('month_snapshots').select('bills_paid_amount').eq('household_id', hid).eq('month', MONTH).single();
    check('no double-credit from the no-op', Number(snapStillSame?.bills_paid_amount) === 2023);

    const { data: co3 } = await u1
      .from('bill_carryovers')
      .insert({ household_id: hid, bill_id: null, name: 'Trash', category: 'Bills & Utilities', amount: 60, from_month: MONTH })
      .select()
      .single();
    const { data: strangerResolve } = await u2.rpc('resolve_carryover', { p_carryover_id: co3!.id, p_mark_paid: true, p_paid_amount: 60, p_settled_by_member_id: null });
    check('a stranger cannot resolve another household’s carryover (RLS)', strangerResolve === false, `got ${strangerResolve}`);
    const { data: co3After } = await admin.from('bill_carryovers').select('resolved').eq('id', co3!.id).single();
    check('that carryover is still unresolved after the stranger attempt', co3After?.resolved === false);

    console.log('\n5. RLS isolation on snapshots/carryovers');
    const { data: strangerSnaps } = await u2.from('month_snapshots').select('id').eq('household_id', hid);
    check('stranger sees no snapshots', (strangerSnaps ?? []).length === 0);
    const { data: strangerCarry } = await u2.from('bill_carryovers').select('id').eq('household_id', hid);
    check('stranger sees no carryovers', (strangerCarry ?? []).length === 0);
  } finally {
    await admin.auth.admin.deleteUser(u1Id).catch(() => {});
    await admin.auth.admin.deleteUser(u2Id).catch(() => {});
  }
}

async function main() {
  pureChecks();
  await dbChecks();
  console.log(`\n${fail === 0 ? '✅ ALL CHECKS PASSED' : '❌ SOME CHECKS FAILED'} — ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
main().catch((err) => {
  console.error('verify-month-review failed:', err.message ?? err);
  process.exit(1);
});
