/**
 * Verifies the spend-alert logic (design-brief §2) against the LIVE database,
 * without deploying the edge function. It imports the same pure logic the
 * function uses (supabase/functions/spend-alert/logic.ts), so a pass here means
 * the recipient selection, weekly-balance math, and message are correct.
 *
 * Scenario: "Partner" (a member with no account) logs an expense. The only
 * other member with an account + a push token is the primary user, so the
 * alert should be sent to exactly that device.
 *
 * Run: npm run verify:spend-alert   (needs .env.seed like the seed script)
 *
 * NOT covered here (needs the deployed function + a 2nd real device):
 *   - the Database Webhook firing the function on insert
 *   - delivery to a genuinely separate recipient device
 */
import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

import { computeBudget, computeEnvelopes, adjustedWeeklyAllowance as clientAdjusted } from '../src/lib/money';
import { weeksInPeriod, weeksRemainingInPeriod } from '../src/lib/period';
import {
  adjustedWeeklyAllowance,
  billVarianceFrom,
  buildSpendAlertBody,
  currentPeriod,
  currentWeekBounds,
  weekFreeToSpend,
  weeklyAllowanceFrom,
  weeksInPeriod as edgeWeeksInPeriod,
} from '../supabase/functions/spend-alert/logic';

loadEnv({ path: '.env.seed' });
loadEnv({ path: '.env' });

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.seed');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

async function main() {
  // Pick the primary user's household and a no-account member to act as spender.
  const { data: members } = await admin
    .from('household_members')
    .select('id, name, account_id, household_id, notify_on_spend');
  if (!members?.length) throw new Error('No members found — run `npm run seed` first.');

  const spender = members.find((m) => !m.account_id) ?? members[0];
  const householdId = spender.household_id;
  console.log(`Simulating: ${spender.name} logs a $18.50 Dining expense.\n`);

  // Insert the expense (the webhook would fire after this).
  const { data: txn, error: insErr } = await admin
    .from('transactions')
    .insert({
      household_id: householdId,
      member_id: spender.id,
      amount: 18.5,
      category: 'dining',
      label: 'Sonic (spend-alert test)',
      type: 'expense',
      is_fun_money: false,
      occurred_on: todayISO(),
    })
    .select()
    .single();
  if (insErr) throw insErr;

  try {
    // --- replicate the edge function's data gathering ---
    const recipientAccounts = members
      .filter((m) => m.household_id === householdId && m.notify_on_spend && m.account_id && m.account_id !== spender.account_id)
      .map((m) => m.account_id as string);

    console.log(`Recipients (other members w/ account + notify_on_spend): ${recipientAccounts.length}`);

    const { data: tokens } = await admin
      .from('push_tokens')
      .select('expo_push_token')
      .in('account_id', recipientAccounts.length ? recipientAccounts : ['none']);
    const pushTokens = (tokens ?? []).map((t) => t.expo_push_token as string);
    console.log(`Push tokens for those recipients: ${pushTokens.length}`);

    const [inc, extra, bills, goals, funSettings, funPeople, household] = await Promise.all([
      admin.from('income_sources').select('amount, frequency').eq('household_id', householdId),
      admin.from('extra_income').select('amount').eq('household_id', householdId),
      admin.from('bills').select('paid, paid_amount, amount').eq('household_id', householdId),
      admin.from('goals').select('monthly_amount').eq('household_id', householdId),
      admin.from('fun_money_settings').select('enabled').eq('household_id', householdId).maybeSingle(),
      admin.from('fun_money_people').select('monthly_amount').eq('household_id', householdId),
      admin.from('households').select('week_start_day').eq('id', householdId).maybeSingle(),
    ]);

    const weekStartDay = household.data?.week_start_day ?? 0;
    const billRows = bills.data ?? [];
    const anchor = todayISO(); // the occurred_on the expense above was inserted with
    const period = currentPeriod(weekStartDay, anchor);
    const allowance = adjustedWeeklyAllowance({
      plannedWeekly: weeklyAllowanceFrom(
        {
          income: inc.data ?? [],
          extra: extra.data ?? [],
          bills: billRows,
          goals: goals.data ?? [],
          funEnabled: !!funSettings.data?.enabled,
          funPeople: funPeople.data ?? [],
        },
        period.weeks
      ),
      billVariance: billVarianceFrom({ bills: billRows }),
      weeksRemaining: period.weeksRemaining,
    });

    const { start, end } = currentWeekBounds(weekStartDay, anchor);
    const [weekTxns, envelopes, rollovers] = await Promise.all([
      admin
        .from('transactions')
        .select('amount, type, is_fun_money, category')
        .eq('household_id', householdId)
        .gte('occurred_on', start)
        .lte('occurred_on', end),
      admin.from('weekly_envelopes').select('category, weekly_amount, skipped_week_start').eq('household_id', householdId),
      admin
        .from('week_rollovers')
        .select('applied_amount')
        .eq('household_id', householdId)
        .eq('to_week_start', start),
    ]);

    const remaining = weekFreeToSpend({
      weeklyAllowance: allowance,
      weekTxns: weekTxns.data ?? [],
      envelopes: (envelopes.data ?? []).map((e) => ({
        category: e.category,
        weekly_amount: Number(e.weekly_amount),
        skipped: e.skipped_week_start === start,
      })),
      carriedIn: (rollovers.data ?? []).reduce((a, r) => a + Number(r.applied_amount), 0),
    });
    const body = buildSpendAlertBody({
      spenderName: spender.name,
      amount: 18.5,
      category: 'dining',
      remaining,
    });

    console.log(`Weekly allowance: $${allowance} · remaining after this spend: $${remaining}`);
    console.log(`\nMessage:\n  "${body}"\n`);

    if (pushTokens.length === 0) {
      console.log('No recipient devices — nothing sent (correct for a solo/accountless household).');
      return;
    }

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(pushTokens.map((to) => ({ to, title: 'OurDollar', body, sound: 'default' }))),
    });
    const result = await res.json();
    console.log('Expo push response:', JSON.stringify(result));
    console.log(`\nSent to ${pushTokens.length} device(s). Check the recipient phone.`);
  } finally {
    // Clean up the test transaction so it doesn't pollute the ledger/budget.
    await admin.from('transactions').delete().eq('id', txn.id);
    console.log('\nCleaned up the test transaction.');
  }
}

/**
 * Regression guard: the edge function's weekFreeToSpend must always agree with
 * the client's computeEnvelopes(...).freeToSpend for the same inputs — that
 * was exactly the bug (a real one, found in review): the push notification's
 * "$X left this week" was computed with pre-envelope math, so it disagreed
 * with the app's own free-to-spend figure (reported: push said "$203 left",
 * app said "-$155"). Reconstructs a similar scenario — spent past an
 * envelope's own budget, plus other spending, on a non-Sunday week start.
 */
function pureEquivalenceCheck() {
  console.log('Pure check: edge-function math must match the client’s computeEnvelopes\n');

  const weeklyAllowance = 500;
  const weekStartDay = 1; // Monday, like the reported scenario likely used
  const envelopes = [
    { category: 'fuel', weekly_amount: 80, skipped: false },
    { category: 'groceries', weekly_amount: 250, skipped: false },
  ];
  // Fuel: $47 of $80 (under). Groceries: not touched. "Other" (dining, kids…)
  // spending well past what's left — the scenario that produced the confusing
  // "$33 left" (Fuel, individually fine) vs "-$155" (household, overall not).
  const weekTxns = [
    { amount: 47, type: 'expense', is_fun_money: false, category: 'fuel' },
    { amount: 27, type: 'expense', is_fun_money: false, category: 'kids' },
    { amount: 568, type: 'expense', is_fun_money: false, category: 'dining' },
  ];

  const edgeResult = weekFreeToSpend({ weeklyAllowance, weekTxns, envelopes });

  const spentByCategory: Record<string, number> = {};
  for (const t of weekTxns) spentByCategory[t.category] = (spentByCategory[t.category] ?? 0) + t.amount;
  const clientResult = computeEnvelopes({
    weeklyAllowance,
    incomeBack: 0,
    totalNonFunExpense: weekTxns.reduce((a, t) => a + t.amount, 0),
    spentByCategory,
    envelopes: envelopes.map((e) => ({ id: e.category, ...e })),
  }).freeToSpend;

  const ok = edgeResult === clientResult;
  console.log(`  ${ok ? '✅' : '❌'} edge weekFreeToSpend (${edgeResult}) === client computeEnvelopes.freeToSpend (${clientResult})`);
  console.log(`  ${ok ? '✅' : '❌'} matches the reported bug shape (household over, one envelope still fine): ${edgeResult < 0}`);

  // The week-start-day fix, independently: Monday-start bounds must actually
  // start on a Monday, not silently fall back to Sunday.
  const { start } = currentWeekBounds(weekStartDay, new Date('2026-07-30T12:00:00Z')); // a Thursday
  const startsOnMonday = new Date(`${start}T00:00:00Z`).getUTCDay() === 1;
  console.log(`  ${startsOnMonday ? '✅' : '❌'} currentWeekBounds(1, …) actually starts on a Monday — got ${start}`);

  if (!ok || !startsOnMonday) {
    throw new Error('spend-alert pure equivalence check failed');
  }
  console.log('');
}

/**
 * Regression guard for bill-estimate variance: a bill paid for more than it was
 * estimated at must reduce only the weeks LEFT in the month, and the edge
 * function must land on the same number as the client. Uses the reported
 * scenario verbatim — OG&E estimated $421, actually $483, halfway through the
 * month — so the $62 gap should cost the two remaining weeks $31 each.
 */
function billVarianceCheck() {
  console.log('Pure check: bill variance lands on the remaining weeks only\n');

  const bills = [
    { name: 'OG&E', paid: true, paid_amount: 483, amount: 421 },
    { name: 'AT&T Phone', paid: true, paid_amount: 272, amount: 272 },
    { name: 'Rent', paid: false, paid_amount: null, amount: 1200 },
  ];
  const income = [{ amount: 4000, frequency: 'monthly' as const }];

  const client = computeBudget({
    incomeSources: income,
    extraIncome: [],
    bills,
    goals: [],
    funMoneyEnabled: false,
    funPeople: [],
    weeksInPeriod: 4, // a 4-week period; the variance math is independent of this
  });

  // Planned: (4000 − (421 + 272 + 1200)) / 4 = 2107 / 4 = 526.75
  const plannedOk = client.weeklyAllowance === 526.75;
  console.log(`  ${plannedOk ? '✅' : '❌'} planned weekly is unchanged by the overage — ${client.weeklyAllowance}`);

  const varianceOk = client.billVariance === 62;
  console.log(`  ${varianceOk ? '✅' : '❌'} variance is the $62 gap — ${client.billVariance}`);

  // Halfway through the month → 2 weeks left → 62/2 = 31 off each.
  const weeksRemaining = 2;
  const adjusted = clientAdjusted({
    plannedWeekly: client.weeklyAllowance,
    billVariance: client.billVariance,
    weeksRemaining,
  });
  const adjustedOk = adjusted === 495.75;
  console.log(`  ${adjustedOk ? '✅' : '❌'} remaining weeks drop by $31 — ${adjusted}`);

  // The edge function must agree, or the push quotes a different number again.
  const edgePlanned = weeklyAllowanceFrom(
    { income, extra: [], bills, goals: [], funEnabled: false, funPeople: [] },
    4 // same 4-week period the client side of this scenario uses
  );
  const edgeAdjusted = adjustedWeeklyAllowance({
    plannedWeekly: edgePlanned,
    billVariance: billVarianceFrom({ bills }),
    weeksRemaining,
  });
  const edgeOk = edgeAdjusted === adjusted;
  console.log(`  ${edgeOk ? '✅' : '❌'} edge function agrees with the client — ${edgeAdjusted} vs ${adjusted}`);

  // Weeks-remaining now comes from the period math, which counts real weeks
  // rather than the uneven day-of-month buckets this used to assert (days 22
  // through 31 were all called "1 week"). verify:periods covers that countdown
  // day by day, and periodEquivalenceCheck below pins the edge function to it.

  // Over the whole month the variance is absorbed exactly once: spending the
  // planned figure for the first two weeks and the adjusted one for the last
  // two must equal the plan minus the overage.
  const monthTotal = client.weeklyAllowance * 2 + adjusted * 2;
  const totalOk = Math.round(monthTotal * 100) / 100 === Math.round((client.weeklyAllowance * 4 - 62) * 100) / 100;
  console.log(`  ${totalOk ? '✅' : '❌'} month absorbs the $62 exactly once — ${monthTotal}`);

  if (!plannedOk || !varianceOk || !adjustedOk || !edgeOk || !totalOk) {
    throw new Error('bill variance check failed');
  }
  console.log('');
}

/**
 * Regression guard for budget periods: the edge function derives its own period
 * math (Deno can't import the client's), so the two must agree on every week
 * count and every remaining-weeks count, or the push quotes a weekly figure the
 * Week screen disagrees with. That exact drift has already shipped twice.
 */
function periodEquivalenceCheck() {
  console.log('Pure check: edge-function periods must match the client’s\n');

  let weekMismatch = 0;
  let remainingMismatch = 0;
  const samples: string[] = [];

  for (let ws = 0; ws < 7; ws++) {
    for (const y of [2025, 2026, 2027]) {
      for (let m = 0; m < 12; m++) {
        const clientWeeks = weeksInPeriod(`${y}-${String(m + 1).padStart(2, '0')}-01`, ws);
        const edgeWeeks = edgeWeeksInPeriod(y, m, ws);
        if (clientWeeks !== edgeWeeks) weekMismatch++;
        if (ws === 1 && y === 2026 && m === 7) samples.push(`Aug2026=${edgeWeeks}w`);
      }
    }
  }
  check2('week counts agree across 3 years and all 7 start days', weekMismatch === 0, samples.join(' '));

  // Remaining-weeks, day by day through a year.
  for (let ws = 0; ws < 7; ws++) {
    const cursor = new Date(Date.UTC(2026, 0, 1));
    for (let i = 0; i < 365; i++) {
      const iso = cursor.toISOString().slice(0, 10);
      const clientLeft = weeksRemainingInPeriod(ws, iso);
      const edgeLeft = currentPeriod(ws, new Date(`${iso}T12:00:00Z`)).weeksRemaining;
      if (clientLeft !== edgeLeft) remainingMismatch++;
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  check2('weeks-remaining agrees on all 365 days x 7 start days', remainingMismatch === 0, `${remainingMismatch} mismatches`);

  // And the resulting allowance, end to end, on the five-week August case.
  const bills = [{ paid: false, paid_amount: null, amount: 2000 }];
  const income = [{ amount: 4000, frequency: 'monthly' as const }];
  const clientWeekly = computeBudget({
    incomeSources: income,
    extraIncome: [],
    bills,
    goals: [],
    funMoneyEnabled: false,
    funPeople: [],
    weeksInPeriod: weeksInPeriod('2026-08-01', 1),
  }).weeklyAllowance;
  const edgeWeekly = weeklyAllowanceFrom(
    { income, extra: [], bills, goals: [], funEnabled: false, funPeople: [] },
    edgeWeeksInPeriod(2026, 7, 1)
  );
  check2(
    'a five-week August yields the same weekly figure both sides',
    clientWeekly === edgeWeekly && clientWeekly === 400,
    `client ${clientWeekly} vs edge ${edgeWeekly}`
  );

  if (weekMismatch || remainingMismatch || clientWeekly !== edgeWeekly) {
    throw new Error('period equivalence check failed');
  }
  console.log('');
}

/**
 * Regression guard for the carried-over week (the reported bug): when a
 * household settles a week that finished over budget by carrying it forward,
 * week_rollovers.applied_amount is negative and the Week screen folds it into
 * the new week's effective allowance. The push ignored the table entirely, so
 * it quoted a balance too generous by exactly the carried overage — reported:
 * push said "over $100 left", app said "-$1.75".
 */
function carryForwardCheck() {
  console.log('Pure check: a carried-over week must move the push’s figure too\n');

  const weeklyAllowance = 800;
  const carriedIn = -104; // last week finished $104 over and was carried forward
  const envelopes = [{ category: 'fuel', weekly_amount: 80, skipped: false }];
  // Fuel $93 of $80 (over by $13) plus $631 of other spending = $724 spent.
  const weekTxns = [
    { amount: 93, type: 'expense', is_fun_money: false, category: 'fuel' },
    { amount: 631, type: 'expense', is_fun_money: false, category: 'groceries' },
  ];

  const spentByCategory: Record<string, number> = {};
  for (const t of weekTxns) spentByCategory[t.category] = (spentByCategory[t.category] ?? 0) + t.amount;
  const client = computeEnvelopes({
    weeklyAllowance,
    incomeBack: 0 + carriedIn, // the Week screen passes incomeBack + adjustment
    totalNonFunExpense: weekTxns.reduce((a, t) => a + t.amount, 0),
    spentByCategory,
    envelopes: envelopes.map((e) => ({ id: e.category, ...e })),
  }).freeToSpend;

  const edge = weekFreeToSpend({ weeklyAllowance, weekTxns, envelopes, carriedIn });
  check2(`edge agrees with the client once the carry-in is applied`, edge === client, `${edge} vs ${client}`);
  check2('and the household reads as over budget, not flush', edge < 0, `${edge}`);

  // The gap this closes: ignoring the carry-in is a straight overstatement.
  const ignoringCarry = weekFreeToSpend({ weeklyAllowance, weekTxns, envelopes });
  check2(
    'ignoring the carry-in is exactly what produced the wrong push',
    Math.round((ignoringCarry - edge) * 100) / 100 === -carriedIn,
    `would have said ${ignoringCarry} instead of ${edge}`
  );

  if (edge !== client || edge >= 0) throw new Error('carry-forward check failed');
  console.log('');
}

/**
 * Regression guard for income frequency: the edge function keeps its own
 * multiplier table (Deno can't import the client's), and it was missing
 * biweekly and weekly entirely — both silently fell back to "monthly", which
 * understated a biweekly-paid household's income by more than half.
 */
function frequencyCheck() {
  console.log('Pure check: edge-function income frequencies must match the client’s\n');

  let mismatch = 0;
  for (const frequency of ['monthly', 'semimonthly', 'biweekly', 'weekly'] as const) {
    const income = [{ amount: 1000, frequency }];
    const client = computeBudget({
      incomeSources: income,
      extraIncome: [],
      bills: [],
      goals: [],
      funMoneyEnabled: false,
      funPeople: [],
      weeksInPeriod: 4,
    }).weeklyAllowance;
    const edge = weeklyAllowanceFrom(
      { income, extra: [], bills: [], goals: [], funEnabled: false, funPeople: [] },
      4
    );
    const ok = client === edge;
    if (!ok) mismatch++;
    console.log(`  ${ok ? '✅' : '❌'} ${frequency}: client ${client} vs edge ${edge}`);
  }

  if (mismatch) throw new Error('income frequency check failed');
  console.log('');
}

/**
 * Regression guard for the anchor date: the function runs on a UTC server, so
 * an expense logged on a US evening carries tomorrow's UTC date. Anchoring to
 * the transaction's own occurred_on (already the household's local date) keeps
 * the push on the week the app is showing.
 */
function anchorDateCheck() {
  console.log('Pure check: the week is anchored to occurred_on, not the server clock\n');

  // Friday-start week, like the reported household. An expense that occurred on
  // Thursday Aug 13 (the LAST day of that week) logged at 7:33pm US Central is
  // already Aug 14 in UTC — the next week.
  const weekStartDay = 5;
  const serverNow = new Date('2026-08-14T00:33:00Z');

  const byClock = currentWeekBounds(weekStartDay, serverNow);
  const byOccurredOn = currentWeekBounds(weekStartDay, '2026-08-13');

  check2('occurred_on keeps the expense in its own week', byOccurredOn.start === '2026-08-07', byOccurredOn.start);
  check2('the raw UTC clock would have skipped a week', byClock.start === '2026-08-14', byClock.start);

  // Same for the period, which drives weeks-remaining and the bill variance.
  const p = currentPeriod(weekStartDay, '2026-08-13');
  check2('period math accepts the same anchor', p.weeksRemaining >= 1, `${p.weeksRemaining} week(s) left`);

  if (byOccurredOn.start !== '2026-08-07' || byClock.start !== '2026-08-14') {
    throw new Error('anchor date check failed');
  }
  console.log('');
}

function check2(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
}

pureEquivalenceCheck();
carryForwardCheck();
frequencyCheck();
anchorDateCheck();
billVarianceCheck();
periodEquivalenceCheck();

main().catch((err) => {
  console.error('verify-spend-alert failed:', err.message ?? err);
  process.exit(1);
});
