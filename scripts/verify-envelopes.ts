/**
 * Verifies the weekly-envelopes ("planned spending") feature:
 *   Part A — the pure math (computeEnvelopes from src/lib/money), including the
 *     mockup scenario, skip, over-budget, and the spent+reserved+free invariant.
 *   Part B — the live DB: table + RLS + unique(household_id,category), and that
 *     draining from real transactions (excluding fun-money) reconciles.
 *
 * Run: npm run verify:envelopes   (needs .env.seed + .env like the others)
 * Needs migration 20260716000009_weekly_envelopes.sql applied.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

import { computeEnvelopes } from '../src/lib/money';

loadEnv({ path: '.env.seed' });
loadEnv({ path: '.env' });

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error('Missing env. Need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.seed, and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env.');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  ✅' : '  ❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

// --- Part A: pure math ---
function mathChecks() {
  console.log('\nA. Envelope math (computeEnvelopes)');

  // Mockup scenario: allowance 600; groceries 250/180, gas 100/0, dining 50/65,
  // plus $30 of un-enveloped ("other") spend → total non-fun expense 275.
  const base = computeEnvelopes({
    weeklyAllowance: 600,
    incomeBack: 0,
    totalNonFunExpense: 275,
    spentByCategory: { groceries: 180, fuel: 0, dining: 65, other: 30 },
    envelopes: [
      { id: 'g', category: 'groceries', weekly_amount: 250, skipped: false },
      { id: 'f', category: 'fuel', weekly_amount: 100, skipped: false },
      { id: 'd', category: 'dining', weekly_amount: 50, skipped: false },
    ],
  });
  check('reserved = 170', base.reserved === 170, `got ${base.reserved}`);
  check('freeToSpend = 155', base.freeToSpend === 155, `got ${base.freeToSpend}`);
  check('spent = 275', base.spent === 275, `got ${base.spent}`);
  check(
    'invariant spent+reserved+free = allowance',
    base.spent + base.reserved + base.freeToSpend === base.effAllowance
  );
  const byId = Object.fromEntries(base.envelopes.map((e) => [e.id, e]));
  check('groceries on-track', byId.g.state === 'on-track' && byId.g.remaining === 70);
  check('fuel untouched', byId.f.state === 'untouched' && byId.f.remaining === 100);
  check('dining over', byId.d.state === 'over' && byId.d.over === 15);

  // Skip gas → its $100 reservation is released back to free.
  const skipped = computeEnvelopes({
    weeklyAllowance: 600,
    incomeBack: 0,
    totalNonFunExpense: 275,
    spentByCategory: { groceries: 180, fuel: 0, dining: 65, other: 30 },
    envelopes: [
      { id: 'g', category: 'groceries', weekly_amount: 250, skipped: false },
      { id: 'f', category: 'fuel', weekly_amount: 100, skipped: true },
      { id: 'd', category: 'dining', weekly_amount: 50, skipped: false },
    ],
  });
  check('skip releases reservation: reserved 170→70', skipped.reserved === 70, `got ${skipped.reserved}`);
  check('skip raises free 155→255', skipped.freeToSpend === 255, `got ${skipped.freeToSpend}`);
  check('skipped envelope state', skipped.envelopes.find((e) => e.id === 'f')!.state === 'skipped');

  // Over-committed: tiny allowance, one big untouched envelope → negative free.
  const neg = computeEnvelopes({
    weeklyAllowance: 100,
    incomeBack: 0,
    totalNonFunExpense: 0,
    spentByCategory: {},
    envelopes: [{ id: 'g', category: 'groceries', weekly_amount: 250, skipped: false }],
  });
  check('over-committed free goes negative', neg.freeToSpend === -150, `got ${neg.freeToSpend}`);

  // No envelopes → free is just allowance − spent (matches the plain view).
  const none = computeEnvelopes({
    weeklyAllowance: 400,
    incomeBack: 20,
    totalNonFunExpense: 90,
    spentByCategory: { other: 90 },
    envelopes: [],
  });
  check('no envelopes: hasEnvelopes false', none.hasEnvelopes === false);
  check('no envelopes: free = allowance + back − spent', none.freeToSpend === 330, `got ${none.freeToSpend}`);
}

// --- Part B: live DB ---
const PASSWORD = 'ourdollar-env-pw-1';
const stamp = Date.now();
const U1 = `ourdollar-env+owner-${stamp}@example.com`;
const U2 = `ourdollar-env+other-${stamp}@example.com`;

async function makeUser(email: string): Promise<string> {
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
async function createHousehold(c: SupabaseClient, accountId: string): Promise<string> {
  const { data: h, error: he } = await c
    .from('households')
    .insert({ name: 'Env Home', owner_account_id: accountId })
    .select()
    .single();
  if (he) throw he;
  const { error: me } = await c
    .from('household_members')
    .insert({ household_id: h.id, account_id: accountId, name: 'Owner', is_admin: true, has_account: true });
  if (me) throw me;
  await c.from('fun_money_settings').insert({ household_id: h.id, enabled: true });
  return h.id as string;
}

async function dbChecks() {
  console.log('\nB. Live DB (table + RLS + draining)');
  const u1Id = await makeUser(U1);
  const u2Id = await makeUser(U2);
  const u1 = await signIn(U1);
  const u2 = await signIn(U2);
  const today = new Date().toISOString().slice(0, 10);

  try {
    const hid = await createHousehold(u1, u1Id);
    const memberId = (
      await u1.from('household_members').select('id').eq('household_id', hid).single()
    ).data!.id as string;

    // Insert two envelopes.
    const { error: e1 } = await u1
      .from('weekly_envelopes')
      .insert([
        { household_id: hid, category: 'groceries', weekly_amount: 250 },
        { household_id: hid, category: 'fuel', weekly_amount: 100 },
      ]);
    check('owner can insert envelopes', !e1, e1?.message);

    // Duplicate category rejected by unique(household_id, category).
    const { error: dup } = await u1
      .from('weekly_envelopes')
      .insert({ household_id: hid, category: 'groceries', weekly_amount: 99 });
    check('duplicate category rejected', !!dup && dup.code === '23505', dup?.code ?? 'no error');

    // RLS: U2 cannot see U1's envelopes.
    const { data: u2sees } = await u2.from('weekly_envelopes').select('id').eq('household_id', hid);
    check('other user sees none (RLS)', (u2sees ?? []).length === 0, `saw ${(u2sees ?? []).length}`);

    // Transactions: $180 groceries + $30 other (both drain), plus a $40 FUN-money
    // groceries expense that must be EXCLUDED from envelope draining.
    await u1.from('transactions').insert([
      { household_id: hid, member_id: memberId, amount: 180, category: 'groceries', label: 'Store', type: 'expense', is_fun_money: false, occurred_on: today },
      { household_id: hid, member_id: memberId, amount: 30, category: 'other', label: 'Misc', type: 'expense', is_fun_money: false, occurred_on: today },
      { household_id: hid, member_id: memberId, amount: 40, category: 'groceries', label: 'Treat', type: 'expense', is_fun_money: true, occurred_on: today },
    ]);

    // Read back and drain — exactly as the Week screen does.
    const { data: envs } = await u1.from('weekly_envelopes').select('*').eq('household_id', hid);
    const { data: txns } = await u1.from('transactions').select('*').eq('household_id', hid);
    const spentByCategory: Record<string, number> = {};
    let totalNonFun = 0;
    for (const t of txns ?? []) {
      if (t.type === 'expense' && !t.is_fun_money) {
        spentByCategory[t.category ?? 'other'] = (spentByCategory[t.category ?? 'other'] ?? 0) + Number(t.amount);
        totalNonFun += Number(t.amount);
      }
    }
    const summary = computeEnvelopes({
      weeklyAllowance: 600,
      incomeBack: 0,
      totalNonFunExpense: totalNonFun,
      spentByCategory,
      envelopes: (envs ?? []).map((e) => ({
        id: e.id,
        category: e.category,
        weekly_amount: Number(e.weekly_amount),
        skipped: false,
      })),
    });
    check('fun-money grocery excluded (spent = 210 not 250)', summary.spent === 210, `got ${summary.spent}`);
    const groc = summary.envelopes.find((e) => e.category === 'groceries')!;
    check('groceries drained to $70 left', groc.remaining === 70, `got ${groc.remaining}`);
    // reserved = groceries remaining 70 + fuel untouched 100 = 170; free = 600−350−30 = 220.
    check('reserved = 170', summary.reserved === 170, `got ${summary.reserved}`);
    check('freeToSpend = 220', summary.freeToSpend === 220, `got ${summary.freeToSpend}`);

    // Skip self-reset: skipping for a DIFFERENT week's start does NOT skip today.
    await u1.from('weekly_envelopes').update({ skipped_week_start: '2020-01-01' }).eq('category', 'groceries').eq('household_id', hid);
    const { data: reread } = await u1.from('weekly_envelopes').select('*').eq('category', 'groceries').eq('household_id', hid).single();
    check('stale skip date ≠ this week → not skipped', reread!.skipped_week_start === '2020-01-01');
  } finally {
    await admin.auth.admin.deleteUser(u1Id).catch(() => {});
    await admin.auth.admin.deleteUser(u2Id).catch(() => {});
  }
}

async function main() {
  mathChecks();
  await dbChecks();
  console.log(`\n${fail === 0 ? '✅ ALL CHECKS PASSED' : '❌ SOME CHECKS FAILED'} — ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error('verify-envelopes failed:', err.message ?? err);
  process.exit(1);
});
