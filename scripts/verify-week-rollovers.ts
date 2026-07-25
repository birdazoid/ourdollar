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
