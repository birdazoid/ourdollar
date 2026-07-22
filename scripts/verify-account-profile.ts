/**
 * Verifies the account-level profile refactor (name + avatar on accounts):
 *   - the columns exist,
 *   - accept_invite stamps the accepter's OWN account name/avatar onto the
 *     claimed member row (not the placeholder the inviter typed),
 *   - a profile edit mirrors onto all of that account's member rows (RLS lets a
 *     user update their own member rows).
 *
 * Run: npm run verify:account-profile   (needs .env.seed + .env like the others)
 * Needs migration 20260716000010_account_profile.sql applied.
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

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = 'ourdollar-prof-pw-1';
const stamp = Date.now();
const U1 = `ourdollar-prof+owner-${stamp}@example.com`;
const U2 = `ourdollar-prof+joiner-${stamp}@example.com`;

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  ✅' : '  ❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

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
async function setProfile(c: SupabaseClient, id: string, name: string, avatar: string) {
  const { error } = await c.from('accounts').update({ name, avatar }).eq('id', id);
  if (error) throw error;
}
// Mirrors useCreateHousehold: reads the account profile for the admin member.
async function createHousehold(c: SupabaseClient, accountId: string, hName: string) {
  const { data: acct } = await c.from('accounts').select('name, avatar').eq('id', accountId).maybeSingle();
  const { data: h, error: he } = await c
    .from('households')
    .insert({ name: hName, owner_account_id: accountId })
    .select()
    .single();
  if (he) throw he;
  const { data: m, error: me } = await c
    .from('household_members')
    .insert({
      household_id: h.id,
      account_id: accountId,
      name: acct?.name ?? 'Me',
      avatar: acct?.avatar ?? '🙂',
      is_admin: true,
      has_account: true,
    })
    .select()
    .single();
  if (me) throw me;
  await c.from('fun_money_settings').insert({ household_id: h.id, enabled: false });
  return { householdId: h.id as string, memberId: m.id as string };
}

async function main() {
  console.log('Creating two throwaway users…');
  const u1Id = await makeUser(U1);
  const u2Id = await makeUser(U2);
  const u1 = await signIn(U1);
  const u2 = await signIn(U2);
  const missingRpc = (e: { code?: string; message?: string } | null) =>
    !!e && ((e.code === 'PGRST202') || /column .*name.* does not exist|could not find/i.test(e.message ?? ''));

  try {
    // Columns exist.
    console.log('\n1. accounts profile columns');
    const { error: colErr } = await u1.from('accounts').select('name, avatar').eq('id', u1Id).maybeSingle();
    if (missingRpc(colErr)) {
      console.log('  ⚠️  Migration 20260716000010 not applied yet — apply it and re-run.');
      return;
    }
    check('accounts.name / avatar selectable', !colErr, colErr?.message);

    // U1 sets profile, creates a household → admin member uses the account name.
    console.log('\n2. Create-household uses the account profile');
    await setProfile(u1, u1Id, 'Alice', '🦊');
    const h1 = await createHousehold(u1, u1Id, 'Alice Home');
    const { data: adminRow } = await u1.from('household_members').select('name, avatar').eq('id', h1.memberId).single();
    check("admin member is 'Alice' / 🦊 from the account", adminRow?.name === 'Alice' && adminRow?.avatar === '🦊', `${adminRow?.name}/${adminRow?.avatar}`);

    // U1 invites U2 with a placeholder name.
    console.log('\n3. Invite U2 with a placeholder label');
    const { data: invite } = await u1
      .from('household_members')
      .insert({
        household_id: h1.householdId,
        name: 'Placeholder',
        avatar: '🙂',
        is_admin: false,
        has_account: false,
        invite_email: U2,
        invite_pending: true,
        invited_by_member_id: h1.memberId,
        invited_at: new Date().toISOString(),
      })
      .select()
      .single();
    check('placeholder invite row created', invite?.name === 'Placeholder');

    // U2 sets their own profile, then accepts — the row should adopt U2's profile.
    console.log('\n4. Accept adopts the joiner’s account profile');
    await setProfile(u2, u2Id, 'Bob', '🐱');
    const { data: accepted, error: acceptErr } = await u2.rpc('accept_invite', { p_member_id: invite!.id });
    if (missingRpc(acceptErr as { code?: string; message?: string })) {
      console.log('  ⚠️  accept_invite not updated yet — apply the migration and re-run.');
      return;
    }
    check('accept_invite returned true', accepted === true, `returned ${accepted}`);
    const { data: joined } = await admin
      .from('household_members')
      .select('name, avatar, account_id')
      .eq('id', invite!.id)
      .single();
    check("member row became 'Bob' / 🐱 (not Placeholder)", joined?.name === 'Bob' && joined?.avatar === '🐱', `${joined?.name}/${joined?.avatar}`);
    check('member row linked to U2', joined?.account_id === u2Id);

    // Profile edit mirrors onto the account's member rows (mimics useUpdateProfile).
    console.log('\n5. Editing the profile mirrors onto member rows');
    await u2.from('accounts').update({ name: 'Bobby', avatar: '🐶' }).eq('id', u2Id);
    await u2.from('household_members').update({ name: 'Bobby', avatar: '🐶' }).eq('account_id', u2Id);
    const { data: synced } = await admin.from('household_members').select('name, avatar').eq('id', invite!.id).single();
    check("member row synced to 'Bobby' / 🐶", synced?.name === 'Bobby' && synced?.avatar === '🐶', `${synced?.name}/${synced?.avatar}`);
  } finally {
    console.log('\nCleaning up test users…');
    await admin.auth.admin.deleteUser(u1Id).catch(() => {});
    await admin.auth.admin.deleteUser(u2Id).catch(() => {});
  }

  console.log(`\n${fail === 0 ? '✅ ALL CHECKS PASSED' : '❌ SOME CHECKS FAILED'} — ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error('verify-account-profile failed:', err.message ?? err);
  process.exit(1);
});
