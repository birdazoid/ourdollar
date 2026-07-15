/**
 * Verifies the send-invite edge function's authorization logic against the LIVE
 * project (without actually sending an email — that needs RESEND_API_KEY set).
 *
 * - A household member invoking send-invite for a real pending invite gets past
 *   every auth/membership/invite check and stops only at "email not configured"
 *   (503) — proving the happy path is wired correctly.
 * - A stranger (not in the household) is rejected with 403 — proving it can't be
 *   used to spam arbitrary addresses.
 * - A bad memberId is rejected with 404.
 *
 * Once RESEND_API_KEY is set, the 503 becomes a real send. Run: npm run verify:send-invite
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.seed' });
loadEnv({ path: '.env' });

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error('Missing env (SUPABASE_URL/SERVICE_ROLE_KEY in .env.seed, EXPO_PUBLIC_SUPABASE_ANON_KEY in .env)');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const stamp = Date.now();
const A_EMAIL = `ourdollar-inv+owner-${stamp}@example.com`;
const C_EMAIL = `ourdollar-inv+stranger-${stamp}@example.com`;
const INVITEE = `ourdollar-inv+invitee-${stamp}@example.com`;
const PASSWORD = 'ourdollar-inv-pw-1';

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '  ✅' : '  ❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

async function makeUser(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  return data.user!.id;
}
async function signIn(email: string): Promise<{ client: SupabaseClient; token: string }> {
  const client = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return { client, token: data.session!.access_token };
}
async function callSendInvite(token: string, memberId: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-invite`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: ANON_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ memberId }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  const aId = await makeUser(A_EMAIL);
  const cId = await makeUser(C_EMAIL);
  const { client: a, token: aToken } = await signIn(A_EMAIL);
  const { token: cToken } = await signIn(C_EMAIL);

  // A creates a household + a pending invite.
  const { data: h, error: hErr } = await a
    .from('households')
    .insert({ name: 'Invite House', owner_account_id: aId })
    .select()
    .single();
  if (hErr) throw hErr;
  await a.from('household_members').insert({ household_id: h.id, account_id: aId, name: 'Owner', is_admin: true, has_account: true });
  const { data: invite } = await a
    .from('household_members')
    .insert({ household_id: h.id, name: 'Invitee', invite_email: INVITEE, invite_pending: true })
    .select()
    .single();

  try {
    console.log('\n1. Member sends a real invite (no Resend key set → should reach "email not configured")');
    const r1 = await callSendInvite(aToken, invite!.id);
    check('reached send step (503 email not configured)', r1.status === 503, `status ${r1.status} ${JSON.stringify(r1.body)}`);

    console.log('\n2. Stranger tries to send the same invite → blocked');
    const r2 = await callSendInvite(cToken, invite!.id);
    check('stranger rejected (403)', r2.status === 403, `status ${r2.status}`);

    console.log('\n3. Bogus memberId → not found');
    const r3 = await callSendInvite(aToken, '00000000-0000-0000-0000-000000000000');
    check('bad invite rejected (404)', r3.status === 404, `status ${r3.status}`);
  } finally {
    console.log('\nCleaning up test users…');
    await admin.auth.admin.deleteUser(aId).catch(() => {});
    await admin.auth.admin.deleteUser(cId).catch(() => {});
  }

  console.log(`\n${fail === 0 ? '✅ ALL CHECKS PASSED' : '❌ SOME CHECKS FAILED'} — ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error('verify-send-invite failed:', err.message ?? err);
  process.exit(1);
});
