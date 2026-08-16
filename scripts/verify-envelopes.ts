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

import {
  computeEnvelopes,
  fmt,
  funMoneyUsed,
  goalProgress,
  isFunExpense,
  isVariableExpense,
  splitAllowancePots,
} from '../src/lib/money';

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

  // The overage is reported, and it is ALREADY out of free — the Week screen
  // shows it as a deduction line, so if it were also subtracted there the
  // household would be charged twice for the same $15.
  check('overage reported = 15 (dining)', base.overage === 15, `got ${base.overage}`);
  check(
    'overage is already out of free (allowance − reserved − spent)',
    base.freeToSpend === base.effAllowance - base.reserved - base.spent,
    `${base.freeToSpend} vs ${base.effAllowance - base.reserved - base.spent}`
  );
  // Spending $15 MORE on an over-budget envelope must cost free exactly $15 —
  // no more (double-charged) and no less (silently absorbed).
  const deeper = computeEnvelopes({
    weeklyAllowance: 600,
    incomeBack: 0,
    totalNonFunExpense: 290,
    spentByCategory: { groceries: 180, fuel: 0, dining: 80, other: 30 },
    envelopes: [
      { id: 'g', category: 'groceries', weekly_amount: 250, skipped: false },
      { id: 'f', category: 'fuel', weekly_amount: 100, skipped: false },
      { id: 'd', category: 'dining', weekly_amount: 50, skipped: false },
    ],
  });
  check('deeper overage: 15 → 30', deeper.overage === 30, `got ${deeper.overage}`);
  check(
    '$15 further over costs free exactly $15',
    base.freeToSpend - deeper.freeToSpend === 15,
    `${base.freeToSpend} → ${deeper.freeToSpend}`
  );

  // An envelope that is merely fully spent (not over) reports no overage, so
  // the deduction row stays hidden rather than showing "-$0".
  const exact = computeEnvelopes({
    weeklyAllowance: 600,
    incomeBack: 0,
    totalNonFunExpense: 50,
    spentByCategory: { dining: 50 },
    envelopes: [{ id: 'd', category: 'dining', weekly_amount: 50, skipped: false }],
  });
  check('exactly on budget reports no overage', exact.overage === 0, `got ${exact.overage}`);

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

/**
 * The Week screen's allowance bar is now the main explanation of how envelopes
 * work, so its arithmetic has to hold. Two pots, planned and free, and the
 * governing promise: spending INSIDE an envelope must not move free-to-spend.
 */
function potChecks() {
  console.log('\nC. Allowance bar (splitAllowancePots)');

  const summary = (fuelSpent: number, otherSpent = 0) =>
    computeEnvelopes({
      weeklyAllowance: 372.25,
      incomeBack: 0,
      totalNonFunExpense: fuelSpent + otherSpent,
      spentByCategory: { fuel: fuelSpent, dining: otherSpent },
      envelopes: [{ id: 'f', category: 'fuel', weekly_amount: 80, skipped: false }],
    });

  // The promise: fuel from $0 to its full $80 must not move free-to-spend, and
  // the planned block must stay exactly $80 wide the whole way while filling.
  let freeMoved = 0;
  let potDrifted = 0;
  for (let f = 0; f <= 80; f += 5) {
    const p = splitAllowancePots(summary(f));
    if (p.freeLeft !== 292.25) freeMoved++;
    if (p.plannedPot !== 80 || Math.round((p.plannedUsed + p.plannedLeft) * 100) / 100 !== 80) potDrifted++;
    if (p.plannedUsed !== f) potDrifted++;
  }
  check('spending inside the envelope never moves free', freeMoved === 0, `${freeMoved} of 17 steps moved it`);
  check('planned block stays $80 wide and fills to match', potDrifted === 0, `${potDrifted} drifts`);

  // Past the budget, and only then, the spill comes out of free.
  const over = splitAllowancePots(summary(93));
  check('over: planned block is full, not overgrown', over.plannedPot === 80 && over.plannedUsed === 80);
  check('over: $13 spill sits in the free pot', over.overage === 13, `got ${over.overage}`);
  check('over: free drops by exactly the spill', over.freeLeft === 279.25, `got ${over.freeLeft}`);

  // Un-enveloped spending is charged to free, and is kept distinct from spill.
  const mixed = summary(93, 50);
  const mp = splitAllowancePots(mixed);
  check('un-enveloped $50 lands in the free pot, not planned', mp.otherSpent === 50, `got ${mp.otherSpent}`);
  check('spill stays separate from it', mp.overage === 13, `got ${mp.overage}`);

  // The layout invariant: the two pots tile the whole allowance.
  const tiles = (s: ReturnType<typeof computeEnvelopes>) => {
    const p = splitAllowancePots(s);
    const expected = Math.round((s.effAllowance - Math.min(s.freeToSpend, 0)) * 100) / 100;
    return Math.round((p.plannedPot + p.freePot) * 100) / 100 === expected;
  };
  check('pots tile the allowance (under budget)', tiles(summary(56)));
  check('pots tile the allowance (over one envelope)', tiles(summary(93, 50)));

  // An over-budget week clamps free at 0 rather than rendering a backwards bar.
  const broke = computeEnvelopes({
    weeklyAllowance: 100,
    incomeBack: 0,
    totalNonFunExpense: 300,
    spentByCategory: { dining: 300 },
    envelopes: [{ id: 'f', category: 'fuel', weekly_amount: 80, skipped: false }],
  });
  const bp = splitAllowancePots(broke);
  check('negative free clamps to 0 for layout', bp.freeLeft === 0, `got ${bp.freeLeft}`);
  check('no negative widths anywhere', Object.values(bp).every((v) => v >= 0), JSON.stringify(bp));
  check('pots still tile it', tiles(broke));
}

/**
 * Every screen that totals "spending" has to agree on what counts. Overview's
 * trend and category breakdown each wrote the filter by hand and both left out
 * the fun-money clause, so they reported bigger numbers than Month Review's
 * identically-labelled figures. One shared predicate now, pinned here.
 */
function spendingBasisChecks() {
  console.log('\nD. What counts as spending (isVariableExpense / isFunExpense)');

  const rows = [
    { type: 'expense' as const, is_fun_money: false, what: 'a plain expense' },
    { type: 'expense' as const, is_fun_money: true, what: 'a fun-money expense' },
    { type: 'income' as const, is_fun_money: false, what: 'money back' },
  ];

  check('a plain expense counts', isVariableExpense(rows[0]));
  check('fun money does NOT count toward variable spending', !isVariableExpense(rows[1]));
  check('income does not count as spending', !isVariableExpense(rows[2]));
  check('fun money is picked up by its own predicate', isFunExpense(rows[1]));
  check('a plain expense is not fun money', !isFunExpense(rows[0]));
  check('income is never fun money', !isFunExpense(rows[2]));

  // The two predicates partition expenses: no double counting, nothing missed.
  const expenses = rows.filter((r) => r.type === 'expense');
  const both = expenses.filter((r) => isVariableExpense(r) && isFunExpense(r));
  const neither = expenses.filter((r) => !isVariableExpense(r) && !isFunExpense(r));
  check('no expense is counted twice', both.length === 0);
  check('no expense falls through the gap', neither.length === 0);

  // Fun money is a MONTHLY pot. The Week screen totalled only the current week
  // against it, so the ring reset every week and could never go over.
  const tx = (occurred_on: string, amount: number, member_id: string, is_fun_money = true) => ({
    type: 'expense' as const,
    is_fun_money,
    member_id,
    occurred_on,
    amount,
  });
  const august = [
    tx('2026-08-03', 30, 'amy'),
    tx('2026-08-11', 30, 'amy'),
    tx('2026-08-19', 30, 'amy'),
    tx('2026-08-27', 30, 'amy'),
    tx('2026-08-14', 55, 'adrian'),
    tx('2026-08-14', 200, 'amy', false), // a normal expense, must not count
    tx('2026-07-30', 40, 'amy'), // last month, must not count
    tx('2026-09-02', 40, 'amy'), // next month, must not count
  ];

  const amyUsed = funMoneyUsed({ transactions: august, memberId: 'amy', monthKey: '2026-08' });
  check('four $30 weeks total $120 for the month', amyUsed === 120, `got ${amyUsed}`);
  check('a $100/mo budget therefore reads as over', 100 - amyUsed === -20, `${100 - amyUsed}`);
  check(
    'other months are excluded',
    funMoneyUsed({ transactions: august, memberId: 'amy', monthKey: '2026-07' }) === 40
  );
  check(
    "one person's spending never lands on another",
    funMoneyUsed({ transactions: august, memberId: 'adrian', monthKey: '2026-08' }) === 55
  );
  check(
    'normal expenses never drain the fun pot',
    !august.some((t) => !t.is_fun_money && isFunExpense(t))
  );
}

/**
 * Display guards. Neither of these should ever be reachable, but a money app
 * that prints "$NaN" or "NaN%" at a household has lost their trust in every
 * other figure on the screen too.
 */
function displayGuardChecks() {
  console.log('\nE. Display guards (fmt / goalProgress)');

  check('fmt(null) is a dash', fmt(null) === '—', fmt(null));
  check('fmt(NaN) degrades to a dash, not "$NaN"', fmt(NaN) === '—', fmt(NaN));
  check('fmt(Infinity) degrades too, not "$∞"', fmt(Infinity) === '—', fmt(Infinity));
  check('fmt(-Infinity) as well', fmt(-Infinity) === '—', fmt(-Infinity));
  check('real money is untouched', fmt(1234) === '$1,234' && fmt(12.5) === '$12.50', `${fmt(1234)} / ${fmt(12.5)}`);
  check('zero still prints', fmt(0) === '$0', fmt(0));

  // The bug: saved / target with a zero target produced NaN, which reached the
  // UI as "NaN%" and a width: "NaN%" style on the progress bar.
  check('a zero target is 0, not NaN', goalProgress(50, 0) === 0, String(goalProgress(50, 0)));
  check('a negative target is 0', goalProgress(50, -100) === 0, String(goalProgress(50, -100)));
  check('NaN inputs are 0', goalProgress(NaN, 100) === 0 && goalProgress(50, NaN) === 0);
  check('half way is 0.5', goalProgress(50, 100) === 0.5, String(goalProgress(50, 100)));
  check('overfunded clamps to 1', goalProgress(500, 100) === 1, String(goalProgress(500, 100)));
  check('negative saved clamps to 0', goalProgress(-20, 100) === 0, String(goalProgress(-20, 100)));
  check(
    'every result is a drawable percentage',
    [[50, 0], [0, 0], [-5, 10], [999, 10], [NaN, NaN]].every(([s, t]) => {
      const p = goalProgress(s, t);
      return Number.isFinite(p) && p >= 0 && p <= 1;
    })
  );
}

async function main() {
  mathChecks();
  potChecks();
  spendingBasisChecks();
  displayGuardChecks();
  await dbChecks();
  console.log(`\n${fail === 0 ? '✅ ALL CHECKS PASSED' : '❌ SOME CHECKS FAILED'} — ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error('verify-envelopes failed:', err.message ?? err);
  process.exit(1);
});
