/**
 * Verifies household role/permission enforcement at the DB layer (RLS + column
 * grants + SECURITY DEFINER RPCs) — the security-critical part of the feature.
 *
 * Covers: a regular member can't remove members, can't self-promote to admin,
 * can't self-approve; their adds are forced to approval_pending; owner/admin can
 * approve, remove, grant admin; only the owner grants admin + transfers
 * ownership; the owner can't be removed; transfer promotes the old owner to admin.
 *
 * Run: npm run verify:household-roles   (needs .env.seed + .env)
 * Needs migration 20260716000012_household_roles.sql applied.
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
const PASSWORD = 'ourdollar-roles-pw-1';
const stamp = Date.now();
const U1 = `ourdollar-roles+owner-${stamp}@example.com`;
const U2 = `ourdollar-roles+member-${stamp}@example.com`;

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
async function rowExists(id: string) {
  const { data } = await admin.from('household_members').select('id').eq('id', id).maybeSingle();
  return !!data;
}
async function addFunMember(c: SupabaseClient, hid: string, name: string) {
  const { data } = await c
    .from('household_members')
    .insert({ household_id: hid, name, is_admin: false, has_account: false, approval_pending: false })
    .select()
    .single();
  return data?.id as string | undefined;
}

async function main() {
  const u1Id = await makeUser(U1);
  const u2Id = await makeUser(U2);
  const u1 = await signIn(U1);
  const u2 = await signIn(U2);

  try {
    // Owner creates household; U2 joins as a regular member via invite+accept.
    const { data: h } = await u1.from('households').insert({ name: 'Roles Home', owner_account_id: u1Id }).select().single();
    const hid = h!.id as string;
    await u1.from('household_members').insert({ household_id: hid, account_id: u1Id, name: 'Owner', is_admin: true, has_account: true });
    await u1.from('fun_money_settings').insert({ household_id: hid, enabled: false });
    const { data: inv } = await u1.from('household_members').insert({ household_id: hid, name: 'Invitee', invite_email: U2, invite_pending: true }).select().single();
    await u2.rpc('accept_invite', { p_member_id: inv!.id });
    const u2mid = (await admin.from('household_members').select('id').eq('household_id', hid).eq('account_id', u2Id).single()).data!.id as string;
    const ownerMid = (await admin.from('household_members').select('id').eq('household_id', hid).eq('account_id', u1Id).single()).data!.id as string;

    console.log('\n1. A regular member’s adds are forced to pending');
    const { error: badInsert } = await u2.from('household_members').insert({ household_id: hid, name: 'Sneaky', approval_pending: false });
    check('member insert with approval_pending=false is rejected', !!badInsert, badInsert?.code ?? 'no error');
    const { data: okInsert, error: okErr } = await u2.from('household_members').insert({ household_id: hid, name: 'Pending Pat', approval_pending: true, added_by_member_id: u2mid }).select().single();
    check('member insert with approval_pending=true is allowed', !okErr && !!okInsert, okErr?.message);
    const pendingId = okInsert?.id as string;

    console.log('\n2. A regular member can’t remove others or self-promote');
    const f1 = await addFunMember(u1, hid, 'Fun One');
    await u2.from('household_members').delete().eq('id', f1!);
    check('member delete of another member is blocked (row survives)', await rowExists(f1!));
    const { error: promoteErr } = await u2.from('household_members').update({ is_admin: true }).eq('id', u2mid);
    check('member can’t set is_admin via update', !!promoteErr, promoteErr?.code ?? 'no error');
    const { error: selfApproveErr } = await u2.from('household_members').update({ approval_pending: false }).eq('id', pendingId);
    check('member can’t clear approval_pending via update', !!selfApproveErr, selfApproveErr?.code ?? 'no error');
    const { data: u2ProfileEdit } = await u2.from('household_members').update({ name: 'Member Two' }).eq('id', u2mid).select();
    check('member CAN edit their own name (benign field)', (u2ProfileEdit ?? []).length === 1);

    console.log('\n3. Only owner/admin can approve; owner approves');
    const { error: notAuth } = await u2.rpc('approve_member', { p_member_id: pendingId });
    check('non-admin approve_member raises not-authorized', !!notAuth, notAuth?.message ?? 'no error');
    await u1.rpc('approve_member', { p_member_id: pendingId });
    const approved = (await admin.from('household_members').select('approval_pending').eq('id', pendingId).single()).data;
    check('owner approve clears approval_pending', approved?.approval_pending === false);

    console.log('\n4. Owner can remove members; owner can’t be removed');
    await u1.from('household_members').delete().eq('id', f1!);
    check('owner can remove a member', !(await rowExists(f1!)));
    await u1.from('household_members').delete().eq('id', ownerMid);
    check('owner’s own membership can’t be deleted', await rowExists(ownerMid));

    console.log('\n5. Only owner grants admin; admin then gains powers');
    const { error: memberGrant } = await u2.rpc('set_member_admin', { p_member_id: u2mid, p_is_admin: true });
    check('non-owner set_member_admin raises error', !!memberGrant, memberGrant?.message ?? 'no error');
    await u1.rpc('set_member_admin', { p_member_id: u2mid, p_is_admin: true });
    check('owner granted U2 admin', (await admin.from('household_members').select('is_admin').eq('id', u2mid).single()).data?.is_admin === true);
    const f2 = await addFunMember(u1, hid, 'Fun Two');
    await u2.from('household_members').delete().eq('id', f2!);
    check('admin U2 can now remove a member', !(await rowExists(f2!)));

    console.log('\n6. Only owner transfers ownership; old owner becomes admin');
    const { error: adminXfer } = await u2.rpc('transfer_ownership', { p_member_id: ownerMid });
    check('admin (non-owner) transfer_ownership raises error', !!adminXfer, adminXfer?.message ?? 'no error');
    await u1.rpc('transfer_ownership', { p_member_id: u2mid });
    const hAfter = (await admin.from('households').select('owner_account_id').eq('id', hid).single()).data;
    check('ownership moved to U2', hAfter?.owner_account_id === u2Id);
    const oldOwner = (await admin.from('household_members').select('is_admin').eq('id', ownerMid).single()).data;
    check('old owner is now an admin', oldOwner?.is_admin === true);
  } finally {
    await admin.auth.admin.deleteUser(u1Id).catch(() => {});
    await admin.auth.admin.deleteUser(u2Id).catch(() => {});
  }

  console.log(`\n${fail === 0 ? '✅ ALL CHECKS PASSED' : '❌ SOME CHECKS FAILED'} — ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
main().catch((err) => {
  console.error('verify-household-roles failed:', err.message ?? err);
  process.exit(1);
});
