/**
 * Verifies Phase 8 (explicit invite accept / decline) against the LIVE database,
 * exercising the exact RPCs the app calls: list_my_pending_invites,
 * accept_invite, decline_invite.
 *
 * Scenario:
 *   1. Owner U1 creates two households and captures their own member id.
 *   2. U1 invites U2 (by email) into BOTH households — placeholder member rows
 *      with invite_pending, invited_at, and invited_by_member_id set.
 *   3. U2 calls list_my_pending_invites and sees exactly 2 invites, each naming
 *      the household and the inviter ("Owner").
 *   4. Security: a THIRD user U3 cannot accept an invite addressed to U2
 *      (accept_invite returns false, the row is untouched).
 *   5. U2 declines invite B — it disappears from their list and the row is gone.
 *   6. U2 accepts invite A — they become a member, the household is now visible,
 *      and the row is linked (account set, not pending). The list is now empty.
 *
 * Three throwaway users are created and deleted (cascade) at the end.
 *
 * Run: npm run verify:invite-accept   (needs .env.seed + .env like the others)
 *
 * NOTE: needs migration 20260716000008_invite_accept_decline.sql applied. If the
 * RPCs aren't there yet, the script reports it clearly.
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

const PASSWORD = 'ourdollar-inv-pw-1';
const stamp = Date.now();
const U1_EMAIL = `ourdollar-inv+owner-${stamp}@example.com`;
const U2_EMAIL = `ourdollar-inv+invitee-${stamp}@example.com`;
const U3_EMAIL = `ourdollar-inv+other-${stamp}@example.com`;

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

/** Mirrors useCreateHousehold and returns the household id + the owner's member id. */
async function createHousehold(
  client: SupabaseClient,
  accountId: string,
  name: string
): Promise<{ householdId: string; ownerMemberId: string }> {
  const { data: h, error: he } = await client
    .from('households')
    .insert({ name, owner_account_id: accountId })
    .select()
    .single();
  if (he) throw he;
  const { data: m, error: me } = await client
    .from('household_members')
    .insert({
      household_id: h.id,
      account_id: accountId,
      name: 'Owner',
      avatar: '🙂',
      is_admin: true,
      has_account: true,
    })
    .select()
    .single();
  if (me) throw me;
  const { error: fe } = await client
    .from('fun_money_settings')
    .insert({ household_id: h.id, enabled: false });
  if (fe) throw fe;
  return { householdId: h.id as string, ownerMemberId: m.id as string };
}

/** Mirrors useMemberMutations.add for the invite case (sets provenance). */
async function inviteByEmail(
  client: SupabaseClient,
  householdId: string,
  inviterMemberId: string,
  email: string
): Promise<string> {
  const { data, error } = await client
    .from('household_members')
    .insert({
      household_id: householdId,
      name: 'Invitee',
      avatar: '🙂',
      is_admin: false,
      has_account: false,
      invite_email: email,
      invite_pending: true,
      invited_by_member_id: inviterMemberId,
      invited_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return data.id as string;
}

async function main() {
  console.log('Creating three throwaway users…');
  const u1Id = await makeUser(U1_EMAIL);
  const u2Id = await makeUser(U2_EMAIL);
  const u3Id = await makeUser(U3_EMAIL);
  const u1 = await signIn(U1_EMAIL);
  const u2 = await signIn(U2_EMAIL);
  const u3 = await signIn(U3_EMAIL);

  try {
    // 1–2. U1 creates two households and invites U2 into both.
    console.log('\n1. U1 creates two households and invites U2 into both');
    const a = await createHousehold(u1, u1Id, 'House A');
    const b = await createHousehold(u1, u1Id, 'House B');
    const inviteA = await inviteByEmail(u1, a.householdId, a.ownerMemberId, U2_EMAIL);
    const inviteB = await inviteByEmail(u1, b.householdId, b.ownerMemberId, U2_EMAIL);
    check('two invite rows created', !!inviteA && !!inviteB);

    // 3. U2 lists their pending invites.
    console.log('\n2. U2 lists pending invites');
    const { data: list, error: listErr } = await u2.rpc('list_my_pending_invites');
    const missing =
      listErr &&
      ((listErr as { code?: string }).code === 'PGRST202' ||
        /could not find the function|does not exist/i.test(listErr.message));
    if (missing) {
      console.log('  ⚠️  Invite RPCs not deployed yet.');
      console.log('     Paste supabase/migrations/20260716000008_invite_accept_decline.sql into');
      console.log('     the Supabase SQL editor, then re-run this script.');
      return;
    }
    if (listErr) throw listErr;
    const invites = (list ?? []) as {
      member_id: string;
      household_name: string;
      inviter_name: string;
    }[];
    check('U2 sees exactly 2 pending invites', invites.length === 2, `saw ${invites.length}`);
    check(
      'invites name the households',
      invites.some((i) => i.household_name === 'House A') &&
        invites.some((i) => i.household_name === 'House B')
    );
    check('invites name the inviter', invites.every((i) => i.inviter_name === 'Owner'));

    // 4. Security: U3 cannot accept an invite addressed to U2.
    console.log('\n3. U3 cannot accept an invite addressed to U2');
    const { data: stolen } = await u3.rpc('accept_invite', { p_member_id: inviteA });
    check('accept_invite returns false for the wrong user', stolen === false, `returned ${stolen}`);
    const { data: stillPending } = await admin
      .from('household_members')
      .select('account_id, invite_pending')
      .eq('id', inviteA)
      .single();
    check(
      'invite A untouched after U3 attempt',
      stillPending?.account_id === null && stillPending?.invite_pending === true
    );

    // 5. U2 declines invite B.
    console.log('\n4. U2 declines invite B');
    const { data: declined } = await u2.rpc('decline_invite', { p_member_id: inviteB });
    check('decline_invite returns true', declined === true, `returned ${declined}`);
    const { data: goneRow } = await admin
      .from('household_members')
      .select('id')
      .eq('id', inviteB)
      .maybeSingle();
    check('declined invite row is deleted', goneRow == null);
    const { data: afterDecline } = await u2.rpc('list_my_pending_invites');
    check('U2 now sees exactly 1 invite', (afterDecline ?? []).length === 1, `saw ${(afterDecline ?? []).length}`);

    // 6. U2 accepts invite A.
    console.log('\n5. U2 accepts invite A');
    const { data: accepted } = await u2.rpc('accept_invite', { p_member_id: inviteA });
    check('accept_invite returns true', accepted === true, `returned ${accepted}`);
    const { data: u2Houses } = await u2.from('households').select('id');
    check('U2 now sees House A', !!u2Houses?.some((h) => h.id === a.householdId));
    const { data: linked } = await admin
      .from('household_members')
      .select('account_id, has_account, invite_pending')
      .eq('id', inviteA)
      .single();
    check(
      'accepted member row linked to U2 (account set, not pending)',
      linked?.account_id === u2Id && linked?.has_account === true && linked?.invite_pending === false
    );
    const { data: afterAccept } = await u2.rpc('list_my_pending_invites');
    check('U2 has no pending invites left', (afterAccept ?? []).length === 0, `saw ${(afterAccept ?? []).length}`);
  } finally {
    console.log('\nCleaning up test users (cascades their households)…');
    await admin.auth.admin.deleteUser(u1Id).catch(() => {});
    await admin.auth.admin.deleteUser(u2Id).catch(() => {});
    await admin.auth.admin.deleteUser(u3Id).catch(() => {});
  }

  console.log(`\n${fail === 0 ? '✅ ALL CHECKS PASSED' : '❌ SOME CHECKS FAILED'} — ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error('verify-invite-accept failed:', err.message ?? err);
  process.exit(1);
});
