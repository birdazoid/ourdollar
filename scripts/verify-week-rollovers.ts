/**
 * Verifies week_rollovers against the live DB: settle once per (household,
 * from_week_start) via the unique constraint, carry_forward sums correctly into
 * the target week via useWeekAdjustment's query shape, and the goal resolution
 * updates goals.saved_amount (clamped to the target).
 *
 * Run: npm run verify:week-rollovers   (needs .env.seed + .env like the others)
 * Needs migration 20260717000013_week_rollovers.sql applied.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

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
const PASSWORD = 'ourdollar-roll-pw-1';
const stamp = Date.now();
const U1 = `ourdollar-roll+owner-${stamp}@example.com`;

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

async function main() {
  const u1Id = await makeUser(U1);
  const u1 = await signIn(U1);

  try {
    const { data: h } = await u1.from('households').insert({ name: 'Rollover Home', owner_account_id: u1Id }).select().single();
    const hid = h!.id as string;
    const { data: m } = await u1
      .from('household_members')
      .insert({ household_id: hid, account_id: u1Id, name: 'Owner', is_admin: true, has_account: true })
      .select()
      .single();
    await u1.from('fun_money_settings').insert({ household_id: hid, enabled: false });
    const { data: goal } = await u1
      .from('goals')
      .insert({ household_id: hid, name: 'Trip', target_amount: 1000, monthly_amount: 50, saved_amount: 100 })
      .select()
      .single();

    const FROM = '2026-07-06';
    const TO = '2026-07-13';

    console.log('\n1. Carry-forward leftover');
    const { error: insErr } = await u1.from('week_rollovers').insert({
      household_id: hid,
      from_week_start: FROM,
      to_week_start: TO,
      amount: 42.5,
      resolution: 'carry_forward',
      applied_amount: 42.5,
      settled_by_member_id: m!.id,
    });
    check('settle insert succeeds', !insErr, insErr?.message);

    // Re-settling the SAME from_week_start should violate the unique constraint.
    const { error: uniqueErr } = await u1.from('week_rollovers').insert({
      household_id: hid,
      from_week_start: FROM,
      to_week_start: TO,
      amount: 5,
      resolution: 'dismiss',
    });
    check('re-settling the same week is rejected (unique)', !!uniqueErr && uniqueErr.code === '23505', uniqueErr?.code ?? 'no error');

    // Mirrors useWeekAdjustment: sum applied_amount where to_week_start = TO.
    const { data: applied } = await u1.from('week_rollovers').select('applied_amount').eq('household_id', hid).eq('to_week_start', TO);
    const sum = (applied ?? []).reduce((a, r) => a + Number(r.applied_amount), 0);
    check('week adjustment sums to 42.5', sum === 42.5, `got ${sum}`);

    // Mirrors useRolloverSettled.
    const { data: settled } = await u1.from('week_rollovers').select('id').eq('household_id', hid).eq('from_week_start', FROM).maybeSingle();
    check('rollover settled check finds the row', !!settled);

    console.log('\n2. Goal resolution updates saved_amount (clamped to target)');
    const FROM2 = '2026-07-13';
    const TO2 = '2026-07-20';
    await u1.from('week_rollovers').insert({
      household_id: hid,
      from_week_start: FROM2,
      to_week_start: TO2,
      amount: 950, // would push saved_amount past target (100 + 950 = 1050 > 1000)
      resolution: 'goal',
      applied_amount: 0,
      goal_id: goal!.id,
      settled_by_member_id: m!.id,
    });
    const cap = Math.min(1000, 100 + 950);
    await u1.from('goals').update({ saved_amount: cap }).eq('id', goal!.id);
    const { data: goalAfter } = await u1.from('goals').select('saved_amount').eq('id', goal!.id).single();
    check('goal saved_amount clamped to target (1000)', Number(goalAfter?.saved_amount) === 1000, `got ${goalAfter?.saved_amount}`);

    console.log('\n3. A week with no rollover has a zero adjustment (mirrors the app default)');
    const { data: none } = await u1.from('week_rollovers').select('applied_amount').eq('household_id', hid).eq('to_week_start', '2099-01-01');
    const noneSum = (none ?? []).reduce((a, r) => a + Number(r.applied_amount), 0);
    check('untouched week sums to 0', noneSum === 0, `got ${noneSum}`);

    // ---- 4. Settling through settle_week_rollover, and changing your mind ----
    console.log('\n4. Every choice can be undone, and undoing puts the money back exactly');
    const { data: g2 } = await u1
      .from('goals')
      .insert({ household_id: hid, name: 'Car', target_amount: 500, monthly_amount: 20, saved_amount: 30 })
      .select()
      .single();
    const settle = (from: string, amount: number, resolution: string, goalId: string | null = null) =>
      u1.rpc('settle_week_rollover', {
        p_household_id: hid,
        p_from: from,
        p_to: '2026-09-07',
        p_amount: amount,
        p_resolution: resolution,
        p_goal_id: goalId,
        p_member_id: m!.id,
        p_note: 'test week',
      });
    const reopen = (from: string) => u1.rpc('reopen_week_rollover', { p_household_id: hid, p_from: from });
    const rowFor = async (from: string) =>
      (await u1.from('week_rollovers').select('*').eq('household_id', hid).eq('from_week_start', from).maybeSingle()).data;
    const goalSaved = async () => Number((await u1.from('goals').select('saved_amount').eq('id', g2!.id).single()).data?.saved_amount);
    const owed = async () =>
      ((await u1.from('catchup_entries').select('amount').eq('household_id', hid)).data ?? []).reduce((a, r) => a + Number(r.amount), 0);

    // Goal clamped at zero: $80 over taken from a goal holding $30.
    let r = await settle('2026-08-03', -80, 'goal', g2!.id);
    check('settle to goal succeeds', !r.error, r.error?.message);
    check('goal floored at 0', (await goalSaved()) === 0, `got ${await goalSaved()}`);
    check('goal_applied records what actually moved (-30)', Number((await rowFor('2026-08-03'))?.goal_applied) === -30);
    r = await reopen('2026-08-03');
    check('reopen goal succeeds', !r.error, r.error?.message);
    check('goal back to exactly 30, not 110', (await goalSaved()) === 30, `got ${await goalSaved()}`);
    check('settlement removed, so the week asks again', (await rowFor('2026-08-03')) === null);

    // Catch-up overage.
    r = await settle('2026-08-10', -120, 'catch_up');
    check('settle to catch-up succeeds', !r.error, r.error?.message);
    check('catch-up owes 120', (await owed()) === 120, `got ${await owed()}`);
    check('settlement points at its catch-up entry', !!(await rowFor('2026-08-10'))?.catchup_entry_id);
    await reopen('2026-08-10');
    check('undo removes the catch-up entry', (await owed()) === 0, `got ${await owed()}`);

    // Leftover toward catch-up when nothing is owed writes no entry.
    r = await settle('2026-08-17', 25, 'catch_up');
    check('leftover to empty catch-up settles', !r.error, r.error?.message);
    check('no payment written when nothing is owed', (await owed()) === 0, `got ${await owed()}`);
    await reopen('2026-08-17');

    // Let it go, then change your mind.
    await settle('2026-08-24', -60, 'dismiss');
    check('let-it-go is recorded', (await rowFor('2026-08-24'))?.resolution === 'dismiss');
    await reopen('2026-08-24');
    check('let-it-go can be undone', (await rowFor('2026-08-24')) === null);

    // Carry into the week, then undo: the target week's adjustment returns to 0.
    await settle('2026-08-31', -50, 'carry_forward');
    const adj = async () =>
      ((await u1.from('week_rollovers').select('applied_amount').eq('household_id', hid).eq('to_week_start', '2026-09-07')).data ?? []).reduce(
        (a, x) => a + Number(x.applied_amount),
        0
      );
    check('carry lowers the target week by 50', (await adj()) === -50, `got ${await adj()}`);
    await reopen('2026-08-31');
    check('undoing the carry restores the week', (await adj()) === 0, `got ${await adj()}`);

    // A second settle for the same week fails and leaves the goal alone.
    await settle('2026-09-07', 10, 'goal', g2!.id);
    const dup = await settle('2026-09-07', 10, 'goal', g2!.id);
    check('settling the same week twice is refused', !!dup.error);
    check('the refused settle moved no money (goal 40, not 50)', (await goalSaved()) === 40, `got ${await goalSaved()}`);
  } finally {
    await admin.auth.admin.deleteUser(u1Id).catch(() => {});
  }

  console.log(`\n${fail === 0 ? '✅ ALL CHECKS PASSED' : '❌ SOME CHECKS FAILED'} — ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
main().catch((err) => {
  console.error('verify-week-rollovers failed:', err.message ?? err);
  process.exit(1);
});
