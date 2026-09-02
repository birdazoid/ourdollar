/**
 * Verifies the emergency fund: the table, its RLS, the balance-from-entries
 * rule, the withdrawal clamp, that money in and out both leave a record, and
 * the goal-shaped half added later - a target that never refuses money, a
 * monthly amount that comes out of the plan, and one contribution a month.
 *
 * Run: npm run verify:emergency-fund   (needs .env.seed like the others)
 */
import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

import {
  balanceFromEntries,
  computeBudget,
  goalProgress,
  monthlyContributionMade,
} from '../src/lib/money';

loadEnv({ path: '.env.seed' });
loadEnv({ path: '.env' });

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

function pureChecks() {
  console.log('\nA. Balance is the sum of its movements');
  const e = (amount: number) => ({ amount });

  check('empty fund is zero', balanceFromEntries([]) === 0);
  check('undefined is safe', balanceFromEntries(undefined) === 0);
  check('one deposit', balanceFromEntries([e(500)]) === 500);
  check('deposits accumulate', balanceFromEntries([e(500), e(250)]) === 750);
  check('a withdrawal reduces it', balanceFromEntries([e(500), e(-200)]) === 300);
  check('emptying it lands on zero', balanceFromEntries([e(500), e(-500)]) === 0);
  // A fund can't owe you money, so an over-withdrawal reads as empty rather
  // than negative. The withdrawal itself is clamped before it's ever written.
  check('over-withdrawal floors at zero', balanceFromEntries([e(100), e(-250)]) === 0);
  check('cents survive', balanceFromEntries([e(0.1), e(0.2)]) === 0.3);

  console.log('\nB. Withdrawals are clamped to what is there');
  const clamp = (want: number, balance: number) =>
    Math.round(Math.min(Math.abs(want), balance) * 100) / 100;
  check('asking for less than the balance takes that', clamp(200, 500) === 200);
  check('asking for more takes only what is there', clamp(900, 500) === 500);
  check('asking on an empty fund takes nothing', clamp(50, 0) === 0);

  console.log('\nB2. The target is a marker, never a ceiling');
  check('half way reads 50%', goalProgress(2500, 5000) === 0.5);
  check('no target set never divides by zero', goalProgress(2500, 0) === 0);
  // The bar fills and stops, but nothing anywhere caps the balance itself: a
  // fund you can fill up is not an emergency fund.
  check('past the target the bar stays full', goalProgress(7000, 5000) === 1);
  check('and the balance itself is untouched', balanceFromEntries([e(7000)]) === 7000);
  check('a deposit past the target still counts', balanceFromEntries([e(5000), e(900)]) === 5900);

  console.log('\nB3. The monthly amount comes out of the plan');
  const baseInputs = {
    incomeSources: [{ amount: 4000, frequency: 'monthly' as const }],
    extraIncome: [],
    bills: [{ paid: false, paid_amount: null, amount: 2000 }],
    goals: [],
    funMoneyEnabled: false,
    funPeople: [],
    weeksInPeriod: 4,
  };
  const plan = (emergencyMonthly: number) => computeBudget({ ...baseInputs, emergencyMonthly });
  check('no fund leaves the allowance alone', plan(0).weeklyAllowance === 500, `${plan(0).weeklyAllowance}`);
  // $200 a month over 4 weeks is $50 a week, held back BEFORE the split, the
  // same way a savings goal's monthly amount is.
  check('$200 a month costs $50 a week', plan(200).weeklyAllowance === 450, `${plan(200).weeklyAllowance}`);
  check('and it lands in committed', plan(200).committed === 200, `${plan(200).committed}`);
  check('and is reported on its own', plan(200).emergencyMonthly === 200);
  check('a negative amount can never hand money out', plan(-500).weeklyAllowance === 500);
  check('an unset amount is simply zero', computeBudget(baseInputs).emergencyMonthly === 0);

  console.log('\nB4. Whether the month is already in gets read from the history');
  const m = (kind: string, monthKey: string | null) => ({ kind, month_key: monthKey });
  check('nothing in yet', !monthlyContributionMade([], '2026-09'));
  check('undefined is safe', !monthlyContributionMade(undefined, '2026-09'));
  check('this month counts', monthlyContributionMade([m('monthly', '2026-09')], '2026-09'));
  check('a previous month does not', !monthlyContributionMade([m('monthly', '2026-08')], '2026-09'));
  // A deposit by hand is money out of a week. It must never be mistaken for
  // the planned amount, or the household is asked for the same money twice.
  check('a hand deposit is not the monthly amount', !monthlyContributionMade([m('deposit', null)], '2026-09'));
}

async function dbChecks() {
  console.log('\nC. Live DB');
  const { data: hs } = await admin.from('households').select('id,name');
  const h = (hs ?? []).find((x: any) => /townhouse/i.test(x.name)) ?? (hs ?? [])[0];
  const hid = h.id as string;
  const made: string[] = [];
  const txIds: string[] = [];

  try {
    const { data: ins, error } = await admin
      .from('emergency_fund_entries')
      .insert([
        { household_id: hid, amount: 500, kind: 'deposit', note: 'verify deposit' },
        { household_id: hid, amount: -120, kind: 'withdrawal', note: 'verify withdrawal' },
      ])
      .select('id');
    check('entries insert', !error, error?.message);
    (ins ?? []).forEach((r: any) => made.push(r.id));

    const { data: rows } = await admin.from('emergency_fund_entries').select('*').in('id', made);
    check('balance reads 380 from the rows', balanceFromEntries(rows as any) === 380, String(balanceFromEntries(rows as any)));

    const { error: badKind } = await admin
      .from('emergency_fund_entries')
      .insert({ household_id: hid, amount: 5, kind: 'nonsense' });
    check('unknown kind rejected', !!badKind, badKind?.code ?? 'NOT REJECTED');

    // Taking money out has to raise the week too, or an emergency eats a
    // budget that never held the money.
    const { data: tx, error: tErr } = await admin
      .from('transactions')
      .insert({
        household_id: hid,
        amount: 120,
        type: 'income',
        is_fun_money: false,
        income_destination: 'this_week',
        label: 'verify fund withdrawal',
        occurred_on: new Date().toISOString().slice(0, 10),
      })
      .select('id,income_destination');
    check("withdrawal's matching income row is accepted", !tErr, tErr?.message);
    (tx ?? []).forEach((r: any) => txIds.push(r.id));
    check('and it lands in this week', (tx ?? [])[0]?.income_destination === 'this_week');

    // The new destination has to be accepted by the widened constraint.
    const { data: dep, error: dErr } = await admin
      .from('transactions')
      .insert({
        household_id: hid,
        amount: 75,
        type: 'income',
        is_fun_money: false,
        income_destination: 'emergency_fund',
        label: 'verify fund deposit',
        occurred_on: new Date().toISOString().slice(0, 10),
      })
      .select('id');
    check("'emergency_fund' accepted as a destination", !dErr, dErr?.message);
    (dep ?? []).forEach((r: any) => txIds.push(r.id));

    const { error: bogus } = await admin.from('transactions').insert({
      household_id: hid,
      amount: 1,
      type: 'income',
      is_fun_money: false,
      income_destination: 'made_up',
      label: 'verify bogus',
      occurred_on: new Date().toISOString().slice(0, 10),
    });
    check('a bogus destination is still rejected', !!bogus, bogus?.code ?? 'NOT REJECTED');

    // ---- the planned monthly contribution ----
    const monthKey = '1999-01'; // far outside any real household's history
    const { data: mon, error: mErr } = await admin
      .from('emergency_fund_entries')
      .insert({ household_id: hid, amount: 200, kind: 'monthly', month_key: monthKey, note: 'verify monthly' })
      .select('id');
    check('monthly accepted as a kind', !mErr, mErr?.message);
    (mon ?? []).forEach((r: any) => made.push(r.id));

    // The unique index is what makes two devices tapping at once safe, and
    // what a boolean flag on a row could never guarantee.
    const { error: dupe } = await admin
      .from('emergency_fund_entries')
      .insert({ household_id: hid, amount: 200, kind: 'monthly', month_key: monthKey, note: 'verify duplicate' });
    check('the same month cannot go in twice', dupe?.code === '23505', dupe?.code ?? 'NOT REJECTED');

    const { data: nextMonth, error: nErr } = await admin
      .from('emergency_fund_entries')
      .insert({ household_id: hid, amount: 200, kind: 'monthly', month_key: '1999-02', note: 'verify next month' })
      .select('id');
    check('but the next month can', !nErr, nErr?.message);
    (nextMonth ?? []).forEach((r: any) => made.push(r.id));

    // Putting money in by hand twice in one month is a normal thing to do, so
    // the index must not reach those rows.
    const { data: twice, error: tw } = await admin
      .from('emergency_fund_entries')
      .insert([
        { household_id: hid, amount: 25, kind: 'deposit', note: 'verify hand 1' },
        { household_id: hid, amount: 25, kind: 'deposit', note: 'verify hand 2' },
      ])
      .select('id');
    check('hand deposits are not limited to one a month', !tw, tw?.message);
    (twice ?? []).forEach((r: any) => made.push(r.id));

    // NOTE: money put in by hand charges the week with an ordinary expense
    // row, and that is deliberately NOT exercised against the live database
    // here. A `transactions` INSERT fires the spend-alert Database Webhook,
    // which pushes to every household member's real phone — and a test row has
    // no member_id, so it arrives as "Someone spent $50 on Other" AND defeats
    // the rule that stops the spender notifying themselves. Deleting the row
    // afterwards does not unsend the push.
    //
    // The income half above is safe to insert because the webhook ignores
    // anything that isn't an expense. Expense-side push behaviour belongs to
    // verify-spend-alert.ts, which sends a real push on purpose and says so.

    // ---- the settings row ----
    const { error: sErr } = await admin
      .from('emergency_fund_settings')
      .upsert({ household_id: hid, target_amount: 5000, monthly_amount: 200 }, { onConflict: 'household_id' });
    check('settings upsert', !sErr, sErr?.message);

    const { data: settings } = await admin
      .from('emergency_fund_settings')
      .select('*')
      .eq('household_id', hid)
      .maybeSingle();
    check('the target reads back', Number(settings?.target_amount) === 5000, String(settings?.target_amount));
    check('the monthly amount reads back', Number(settings?.monthly_amount) === 200, String(settings?.monthly_amount));

    // One row per household, so two members can never hold different targets.
    const { error: second } = await admin
      .from('emergency_fund_settings')
      .insert({ household_id: hid, target_amount: 1, monthly_amount: 1 });
    check('only one settings row per household', second?.code === '23505', second?.code ?? 'NOT REJECTED');

    // A closed month has to record the fund too, or its Overview breakdown
    // carries a gap exactly the size of the contribution.
    const { error: snapErr } = await admin.from('month_snapshots').select('emergency_monthly').limit(1);
    check('month_snapshots.emergency_monthly exists', !snapErr, snapErr?.message);
  } finally {
    await admin.from('emergency_fund_settings').delete().eq('household_id', hid);
    if (made.length) await admin.from('emergency_fund_entries').delete().in('id', made);
    if (txIds.length) await admin.from('transactions').delete().in('id', txIds);
    const { data: left } = await admin
      .from('emergency_fund_entries')
      .select('id')
      .in('id', made.length ? made : ['00000000-0000-0000-0000-000000000000']);
    check('cleanup left nothing behind', (left ?? []).length === 0);
  }
}

async function main() {
  pureChecks();
  await dbChecks();
  console.log(`\n${fail === 0 ? '✅ ALL CHECKS PASSED' : '❌ SOME CHECKS FAILED'} — ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error('verify-emergency-fund failed:', err.message ?? err);
  process.exit(1);
});
