/**
 * Verifies in-app account deletion (Phase 6) against the LIVE project, calling
 * the deployed delete-account edge function exactly as the app does.
 *
 * Scenario: a throwaway user creates a household with a bill, then invokes
 * delete-account with their own session. Afterwards the auth user, their
 * account row, and the owned household + its bill must all be gone.
 *
 * Run: npm run verify:account-deletion   (needs .env.seed + .env)
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.seed' });
loadEnv({ path: '.env' });

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (.env.seed) + EXPO_PUBLIC_SUPABASE_ANON_KEY (.env)');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EMAIL = `ourdollar-del+${Date.now()}@example.com`;
const PASSWORD = 'ourdollar-del-pw-1';

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '  ✅' : '  ❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

async function main() {
  console.log('Creating a throwaway user with a household + bill…');
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (cErr) throw cErr;
  const userId = created.user!.id;

  const client: SupabaseClient = createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: sErr } = await client.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (sErr) throw sErr;

  const { data: household, error: hErr } = await client
    .from('households')
    .insert({ name: 'To Delete', owner_account_id: userId })
    .select()
    .single();
  if (hErr) throw hErr;
  await client.from('household_members').insert({
    household_id: household.id,
    account_id: userId,
    name: 'Owner',
    is_admin: true,
    has_account: true,
  });
  const { data: bill } = await client
    .from('bills')
    .insert({ household_id: household.id, name: 'Rent', amount: 1000, category: 'Housing', due_day: 1 })
    .select()
    .single();

  console.log('\nInvoking delete-account as the signed-in user…');
  const { error: dErr } = await client.functions.invoke('delete-account', { method: 'POST' });
  check('delete-account returned success', !dErr, dErr ? dErr.message : '');

  // Give the cascade a moment.
  await new Promise((r) => setTimeout(r, 800));

  console.log('\nVerifying everything is gone (as service role):');
  const { data: gone } = await admin.auth.admin.getUserById(userId);
  check('auth user deleted', !gone?.user);

  const { data: acct } = await admin.from('accounts').select('id').eq('id', userId).maybeSingle();
  check('account row deleted', !acct);

  const { data: hh } = await admin.from('households').select('id').eq('id', household.id).maybeSingle();
  check('owned household deleted', !hh);

  const { data: b } = await admin.from('bills').select('id').eq('id', bill?.id ?? '').maybeSingle();
  check('household bill cascade-deleted', !b);

  // Clean up if the delete somehow didn't remove the user.
  if (gone?.user) await admin.auth.admin.deleteUser(userId).catch(() => {});

  console.log(`\n${fail === 0 ? '✅ ALL CHECKS PASSED' : '❌ SOME CHECKS FAILED'} — ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error('verify-account-deletion failed:', err.message ?? err);
  process.exit(1);
});
