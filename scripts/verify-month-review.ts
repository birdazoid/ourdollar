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

import { monthStartISO, pendingReviewMonth, weekBucketsInMonth } from '../src/lib/month-review';

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
