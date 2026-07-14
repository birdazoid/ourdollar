/**
 * Verifies Phase 3 (multi-household + invite claim) against the LIVE database,
 * exercising the exact client paths the app uses — plain RLS-scoped inserts for
 * household creation, and the claim_pending_invites() RPC for invites.
 *
 * Scenario:
 *   1. Owner U1 creates a household (household + admin member + fun settings),
 *      the way useCreateHousehold does — proving an owner can bootstrap under RLS.
 *   2. U1 creates a second household with THREE members + fun money (N>=3 sanity).
 *   3. U1 invites U2 by email (placeholder member row, account_id = null).
 *   4. Before claiming, U2 cannot see U1's households (RLS isolation holds).
 *   5. U2 calls claim_pending_invites(); the invite links to U2 and the
 *      household becomes visible to them.
 *   6. U2 creates their own SOLO household (N=1 sanity).
 *
 * Two throwaway users are created and deleted (cascade) at the end.
 *
 * Run: npm run verify:multihousehold   (needs .env.seed + .env like the others)
 *
 * NOTE: step 5 needs migration 20260714000004_multi_household.sql applied. If the
 * RPC isn't there yet, the script reports it clearly and skips only that step.
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

const PASSWORD = 'ourdollar-mh-pw-1';
const stamp = Date.now();
const U1_EMAIL = `ourdollar-mh+owner-${stamp}@example.com`;
const U2_EMAIL = `ourdollar-mh+invitee-${stamp}@example.com`;

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  ✅' : '  ❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

async function makeUser(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user!.id;
}

async function signIn(email: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return client;
}

/** Mirrors useCreateHousehold: household + admin member + fun settings. */
async function createHousehold(client: SupabaseClient, accountId: string, name: string, memberName: string) {
  const { data: h, error: he } = await client
    .from('households')
    .insert({ name, owner_account_id: accountId })
    .select()
    .single();
  if (he) throw he;
  const { error: me } = await client.from('household_members').insert({
    household_id: h.id,
    account_id: accountId,
    name: memberName,
    avatar: '🙂',
    is_admin: true,
    has_account: true,
  });
  if (me) throw me;
  const { error: fe } = await client
    .from('fun_money_settings')
    .insert({ household_id: h.id, enabled: false });
  if (fe) throw fe;
  return h.id as string;
}

async function main() {
  console.log('Creating two throwaway users…');
  const u1Id = await makeUser(U1_EMAIL);
  const u2Id = await makeUser(U2_EMAIL);
  const u1 = await signIn(U1_EMAIL);
  const u2 = await signIn(U2_EMAIL);

  try {
    // 1. Owner bootstraps a household.
    console.log('\n1. U1 creates a household');
    const hid1 = await createHousehold(u1, u1Id, 'U1 Home', 'Owner');
    const { data: u1Houses } = await u1.from('households').select('id');
    check('household is visible to its owner', !!u1Houses?.some((h) => h.id === hid1));

    // 2. N>=3 household.
    console.log('\n2. U1 creates a 3-member household (N>=3 sanity)');
    const hid3 = await createHousehold(u1, u1Id, 'Big House', 'Owner');
    for (const nm of ['Second', 'Third']) {
      const { data: m } = await u1
        .from('household_members')
        .insert({ household_id: hid3, name: nm, avatar: '🙂', is_admin: false, has_account: false })
        .select()
        .single();
      await u1.from('fun_money_people').insert({ household_id: hid3, member_id: m!.id, monthly_amount: 50 });
    }
    const { count: memberCount } = await u1
      .from('household_members')
      .select('*', { count: 'exact', head: true })
      .eq('household_id', hid3);
    check('3-member household has 3 members', memberCount === 3, `count=${memberCount}`);

    // 3. Invite U2 into the first household.
    console.log('\n3. U1 invites U2 by email into "U1 Home"');
    const { data: invite, error: invErr } = await u1
      .from('household_members')
      .insert({
        household_id: hid1,
        name: 'Invitee',
        avatar: '🙂',
        is_admin: false,
        has_account: false,
        invite_email: U2_EMAIL,
        invite_pending: true,
      })
      .select()
      .single();
    if (invErr) throw invErr;
    await u1.from('fun_money_people').insert({ household_id: hid1, member_id: invite.id, monthly_amount: 75 });
    check('invite row created (pending, no account)', invite.invite_pending && !invite.account_id);

    // 4. Pre-claim isolation.
    console.log('\n4. Before claiming, U2 should see none of U1\'s households');
    const { data: u2Before } = await u2.from('households').select('id');
    check('U2 sees 0 households before claim', (u2Before ?? []).length === 0, `saw ${(u2Before ?? []).length}`);

    // 5. Claim.
    console.log('\n5. U2 claims pending invites');
    const { data: claimed, error: claimErr } = await u2.rpc('claim_pending_invites');
    const missing =
      claimErr &&
      ((claimErr as { code?: string }).code === 'PGRST202' ||
        /could not find the function|does not exist/i.test(claimErr.message));
    if (missing) {
      console.log('  ⚠️  claim_pending_invites() not deployed yet.');
      console.log('     Paste supabase/migrations/20260714000004_multi_household.sql into the');
      console.log('     Supabase SQL editor, then re-run this script to verify the invite claim.');
    } else if (claimErr) {
      throw claimErr;
    } else {
      check('claim returned 1', claimed === 1, `returned ${claimed}`);
      const { data: u2After } = await u2.from('households').select('id');
      check('U2 now sees the invited household', !!u2After?.some((h) => h.id === hid1));
      const { data: linked } = await admin
        .from('household_members')
        .select('account_id, has_account, invite_pending')
        .eq('id', invite.id)
        .single();
      check(
        'member row linked to U2 (account set, not pending)',
        linked?.account_id === u2Id && linked?.has_account === true && linked?.invite_pending === false
      );
    }

    // 6. Solo household (N=1 sanity).
    console.log('\n6. U2 creates a solo household (N=1 sanity)');
    const soloId = await createHousehold(u2, u2Id, 'Just Me', 'Solo');
    const { count: soloCount } = await u2
      .from('household_members')
      .select('*', { count: 'exact', head: true })
      .eq('household_id', soloId);
    check('solo household has exactly 1 member', soloCount === 1, `count=${soloCount}`);
  } finally {
    console.log('\nCleaning up test users (cascades their households)…');
    await admin.auth.admin.deleteUser(u1Id).catch(() => {});
    await admin.auth.admin.deleteUser(u2Id).catch(() => {});
  }

  console.log(`\n${fail === 0 ? '✅ ALL CHECKS PASSED' : '❌ SOME CHECKS FAILED'} — ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error('verify-multihousehold failed:', err.message ?? err);
  process.exit(1);
});
