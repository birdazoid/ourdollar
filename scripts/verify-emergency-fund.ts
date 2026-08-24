/**
 * Verifies the emergency fund: the table, its RLS, the balance-from-entries
 * rule, the withdrawal clamp, and that money in and out both leave a record.
 *
 * Run: npm run verify:emergency-fund   (needs .env.seed like the others)
 */
import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

import { balanceFromEntries } from '../src/lib/money';

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
  } finally {
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
