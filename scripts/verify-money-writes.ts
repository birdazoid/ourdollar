/**
 * Verifies the money writes that used to be lost, doubled or half-done
 * (migration 20261010000030_atomic_money_writes):
 *
 *   - two phones adding to the same goal at once both count
 *   - a retried save (same id, reply lost the first time) writes nothing new
 *   - "Mark paid" on a goal adds the month once, however many phones tap it
 *   - income past a goal's target or past what catch-up owes overflows into
 *     this week instead of vanishing
 *   - a stranger can't write into someone else's household
 *
 * Creates two throwaway accounts and removes them afterwards.
 * Run: npm run verify:money-writes   (needs .env.seed like the others)
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

import { newId } from '../src/lib/ids';

loadEnv({ path: '.env.seed' });
loadEnv({ path: '.env' });

const URL = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL!;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

const PASSWORD = 'verify-money-writes-pw-1';
const today = new Date().toISOString().slice(0, 10);

async function makeUser(tag: string): Promise<{ id: string; client: SupabaseClient }> {
  const email = `ourdollar-verify+money-${tag}-${Date.now()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  const client = createClient(URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (sErr) throw sErr;
  return { id: data.user.id, client };
}

const income = (
  c: SupabaseClient,
  hid: string,
  amount: number,
  destination: string,
  extra: { id?: string; goalId?: string; label?: string } = {}
) =>
  c.rpc('log_income', {
    p_id: extra.id ?? newId(),
    p_household_id: hid,
    p_member_id: null,
    p_amount: amount,
    p_category: 'other',
    p_label: extra.label ?? 'verify income',
    p_occurred_on: today,
    p_destination: destination,
    p_goal_id: extra.goalId ?? null,
  });

async function main() {
  const owner = await makeUser('owner');
  const stranger = await makeUser('stranger');
  try {
    const { data: h, error: hErr } = await owner.client
      .from('households')
      .insert({ name: 'Verify money writes', owner_account_id: owner.id })
      .select()
      .single();
    if (hErr) throw hErr;
    const hid = h.id as string;
    await owner.client.from('household_members').insert({
      household_id: hid,
      account_id: owner.id,
      name: 'Owner',
      avatar: 'alien',
      is_admin: true,
      has_account: true,
    });
    const { data: goal } = await owner.client
      .from('goals')
      .insert({ household_id: hid, name: 'Trip', target_amount: 1000, monthly_amount: 100, saved_amount: 400 })
      .select()
      .single();
    const goalId = goal!.id as string;
    const savedNow = async () =>
      Number((await admin.from('goals').select('saved_amount').eq('id', goalId).single()).data!.saved_amount);

    console.log('\nA. Two phones adding to one goal at once');
    const [a, b] = await Promise.all([
      income(owner.client, hid, 200, 'goal', { goalId }),
      income(owner.client, hid, 150, 'goal', { goalId }),
    ]);
    check('both calls succeed', !a.error && !b.error, a.error?.message ?? b.error?.message);
    check('goal has both: 400 + 200 + 150 = 750', (await savedNow()) === 750, String(await savedNow()));

    console.log('\nB. Mark paid adds the month while income lands, and never twice');
    const [c1, c2, inc] = await Promise.all([
      owner.client.rpc('contribute_to_goal', { p_goal_id: goalId }),
      owner.client.rpc('contribute_to_goal', { p_goal_id: goalId }),
      income(owner.client, hid, 50, 'goal', { goalId }),
    ]);
    check('calls succeed', !c1.error && !c2.error && !inc.error, c1.error?.message ?? c2.error?.message ?? inc.error?.message);
    check('only one of two taps applied', [c1.data, c2.data].filter((v) => v != null).length === 1, JSON.stringify([c1.data, c2.data]));
    check('goal = 750 + 100 (month, once) + 50 (income) = 900', (await savedNow()) === 900, String(await savedNow()));

    console.log('\nC. A retried save writes nothing new');
    const id = newId();
    const first = await income(owner.client, hid, 30, 'this_week', { id, label: 'retry me' });
    const again = await income(owner.client, hid, 30, 'this_week', { id, label: 'retry me' });
    const { data: retryRows } = await admin.from('transactions').select('id').eq('household_id', hid).eq('label', 'retry me');
    check('first call writes', !first.error && first.data?.duplicate === false, first.error?.message);
    check('second call says duplicate', again.data?.duplicate === true, JSON.stringify(again.data));
    check('exactly one row', (retryRows ?? []).length === 1, String((retryRows ?? []).length));

    console.log('\nD. Income past the goal target overflows into this week');
    const over = await income(owner.client, hid, 250, 'goal', { goalId, label: 'overflow' });
    const { data: oRows } = await admin
      .from('transactions')
      .select('amount,income_destination')
      .eq('household_id', hid)
      .eq('label', 'overflow');
    const toGoal = (oRows ?? []).find((r: any) => r.income_destination === 'goal');
    const toWeek = (oRows ?? []).find((r: any) => r.income_destination === 'this_week');
    check('reports 100 applied, 150 overflow', over.data?.applied === 100 && over.data?.overflow === 150, JSON.stringify(over.data));
    check('goal stops at its 1000 target', (await savedNow()) === 1000, String(await savedNow()));
    check('ledger shows 100 to goal + 150 to this week', Number(toGoal?.amount) === 100 && Number(toWeek?.amount) === 150, JSON.stringify(oRows));

    console.log('\nE. Catch-up never gets overpaid');
    await owner.client.from('catchup_entries').insert({ household_id: hid, amount: 80, kind: 'week_overage', note: 'verify' });
    const cu = await income(owner.client, hid, 100, 'catch_up', { label: 'catch up' });
    const { data: cuEntries } = await admin.from('catchup_entries').select('amount').eq('household_id', hid);
    const owed = (cuEntries ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);
    check('80 applied, 20 overflow', cu.data?.applied === 80 && cu.data?.overflow === 20, JSON.stringify(cu.data));
    check('catch-up balance is exactly zero', owed === 0, String(owed));

    console.log('\nF. Every destination writes its record');
    const ef = await income(owner.client, hid, 40, 'emergency_fund', { label: 'fund' });
    const mo = await income(owner.client, hid, 60, 'month', { label: 'bonus' });
    const { data: fund } = await admin.from('emergency_fund_entries').select('amount').eq('household_id', hid);
    const { data: extra } = await admin.from('extra_income').select('amount,source').eq('household_id', hid);
    check('emergency fund deposit of 40', !ef.error && (fund ?? []).some((r: any) => Number(r.amount) === 40), ef.error?.message);
    check('extra income of 60 for the month', !mo.error && (extra ?? []).some((r: any) => Number(r.amount) === 60), mo.error?.message);

    console.log('\nG. Bad input and strangers are refused');
    const zero = await income(owner.client, hid, 0, 'this_week');
    check('zero income refused', !!zero.error, zero.error?.code ?? 'NOT REFUSED');
    const bogus = await income(owner.client, hid, 10, 'nowhere');
    check('unknown destination refused', !!bogus.error, bogus.error?.code ?? 'NOT REFUSED');
    const sneaky = await income(stranger.client, hid, 10, 'this_week', { label: 'sneaky' });
    const { data: sneakRows } = await admin.from('transactions').select('id').eq('label', 'sneaky');
    check('stranger cannot log income into the household', !!sneaky.error && (sneakRows ?? []).length === 0, sneaky.error?.code ?? 'NOT REFUSED');
    const sneakyGoal = await stranger.client.rpc('contribute_to_goal', { p_goal_id: goalId });
    check('stranger cannot mark the goal paid', sneakyGoal.data == null, JSON.stringify(sneakyGoal.data));

    console.log('\nH. Expense retry with the same id');
    const exId = newId();
    const e1 = await owner.client.from('transactions').insert({ id: exId, household_id: hid, amount: 12, type: 'expense', label: 'dup?', occurred_on: today });
    const e2 = await owner.client.from('transactions').insert({ id: exId, household_id: hid, amount: 12, type: 'expense', label: 'dup?', occurred_on: today });
    const { data: dupRows } = await admin.from('transactions').select('id').eq('label', 'dup?');
    check('first insert succeeds', !e1.error, e1.error?.message);
    check('second insert is recognised (23505), not a second expense', e2.error?.code === '23505' && (dupRows ?? []).length === 1, `${e2.error?.code} / ${(dupRows ?? []).length} rows`);
  } finally {
    await admin.auth.admin.deleteUser(owner.id);
    await admin.auth.admin.deleteUser(stranger.id);
  }

  console.log(`\n${fail === 0 ? '✅ ALL CHECKS PASSED' : '❌ SOME CHECKS FAILED'} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('verify-money-writes crashed:', e.message ?? e);
  process.exit(1);
});
