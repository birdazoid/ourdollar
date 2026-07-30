/**
 * Seed + RLS verification script for OurDollar (build-plan Phase 1).
 *
 * What it does:
 *   1. Uses the service_role key (admin) to create two confirmed test users.
 *   2. Signs in as user A and, as a normal authenticated user, creates a full
 *      household with every entity type (members, income, bills, goals, fun
 *      money, transactions, activity). This exercises the RLS write path.
 *   3. Reads it all back as A (positive check).
 *   4. Signs in as user B (a different household's owner) and confirms B can
 *      neither read nor write A's data (RLS cross-household isolation).
 *
 * The seeded data is left in place so the app has something real to show, and
 * user A's login is printed so you can sign in from the app.
 *
 * Run:   npm run seed            (seed + verify, keep data)
 *        npm run seed -- --cleanup   (delete the test users + all their data)
 *
 * Requires .env.seed (gitignored) with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY,
 * and .env with EXPO_PUBLIC_SUPABASE_ANON_KEY.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.seed' });
loadEnv({ path: '.env' });

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error(
    'Missing env. Need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.seed, and\n' +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY in .env. Copy .env.seed.example to .env.seed first.'
  );
  process.exit(1);
}

// ---- Parameterized seed data (deliberately generic, not a real household) ----
const PASSWORD = 'ourdollar-seed-pw-1';
const USER_A = 'ourdollar-seed+primary@example.com';
const USER_B = 'ourdollar-seed+other@example.com';

const SEED = {
  householdName: 'Test Household',
  members: [
    { key: 'owner', name: 'Primary', avatar: 'alien', isAdmin: true, hasAccount: true, funMoney: 100 },
    { key: 'partner', name: 'Partner', avatar: 'saucer', isAdmin: false, hasAccount: false, funMoney: 80 },
  ],
  income: [
    { memberKey: 'owner', amount: 3300, frequency: 'semimonthly' as const },
    { memberKey: 'partner', amount: 2050, frequency: 'monthly' as const },
  ],
  extraIncome: [{ source: 'Side gig', amount: 60, memberKey: 'owner' }],
  bills: [
    { name: 'Rent', category: 'Housing', amount: 1500, due_day: 1 },
    { name: 'Electric', category: 'Bills & Utilities', amount: 120, due_day: 15, varies: true },
    { name: 'Streaming', category: 'Subscriptions', amount: 15, due_day: 3, paidByKey: 'owner' },
  ],
  goals: [
    { name: 'Emergency Fund', emoji: null, target_amount: 3000, monthly_amount: 200, saved_amount: 600 },
    { name: 'Vacation', emoji: '✈️', target_amount: 1500, monthly_amount: 100, saved_amount: 300 },
  ],
  transactions: [
    { label: 'Groceries', amount: 62.5, memberKey: 'owner', category: 'groceries', is_fun_money: false },
    { label: 'Coffee', amount: 6.25, memberKey: 'partner', category: 'dining', is_fun_money: true },
  ],
};

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function userClient(): SupabaseClient {
  return createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function findUserByEmail(email: string) {
  // Small test project — a single page is plenty.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw error;
  return data.users.find((u) => u.email === email) ?? null;
}

async function ensureUser(email: string): Promise<string> {
  const existing = await findUserByEmail(email);
  if (existing) {
    // Wipe prior seed for a clean, repeatable run (cascades to all their data).
    await admin.auth.admin.deleteUser(existing.id);
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user.id;
}

async function signIn(email: string): Promise<SupabaseClient> {
  const client = userClient();
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return client;
}

let failures = 0;
function check(label: string, pass: boolean, detail = '') {
  console.log(`${pass ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failures++;
}

async function cleanup() {
  for (const email of [USER_A, USER_B]) {
    const u = await findUserByEmail(email);
    if (u) await admin.auth.admin.deleteUser(u.id);
  }
  console.log('Deleted seed users and all their data.');
}

async function seed() {
  console.log('Creating test users...');
  const aId = await ensureUser(USER_A);
  await ensureUser(USER_B);

  const a = await signIn(USER_A);
  const b = await signIn(USER_B);

  console.log('\nWriting household as user A...');
  // Household
  const { data: household, error: hErr } = await a
    .from('households')
    .insert({ name: SEED.householdName, owner_account_id: aId })
    .select()
    .single();
  if (hErr) throw hErr;
  const hid = household.id;
  check('create household', true);

  // Members
  const memberIds: Record<string, string> = {};
  for (const m of SEED.members) {
    const { data, error } = await a
      .from('household_members')
      .insert({
        household_id: hid,
        account_id: m.hasAccount ? aId : null,
        name: m.name,
        avatar: m.avatar,
        is_admin: m.isAdmin,
        has_account: m.hasAccount,
      })
      .select()
      .single();
    if (error) throw error;
    memberIds[m.key] = data.id;
  }
  check('create household_members', Object.keys(memberIds).length === SEED.members.length);

  // Income
  for (const i of SEED.income) {
    const { error } = await a.from('income_sources').insert({
      household_id: hid,
      member_id: memberIds[i.memberKey],
      amount: i.amount,
      frequency: i.frequency,
    });
    if (error) throw error;
  }
  // Extra income
  for (const x of SEED.extraIncome) {
    const { error } = await a.from('extra_income').insert({
      household_id: hid,
      member_id: memberIds[x.memberKey],
      source: x.source,
      amount: x.amount,
    });
    if (error) throw error;
  }
  // Bills
  for (const bl of SEED.bills) {
    const paid = 'paidByKey' in bl && bl.paidByKey;
    const { error } = await a.from('bills').insert({
      household_id: hid,
      name: bl.name,
      category: bl.category,
      amount: bl.amount,
      due_day: bl.due_day,
      varies: 'varies' in bl ? bl.varies : false,
      paid: !!paid,
      paid_amount: paid ? bl.amount : null,
      paid_by_member_id: paid ? memberIds[bl.paidByKey as string] : null,
      paid_on: paid ? new Date().toISOString().slice(0, 10) : null,
    });
    if (error) throw error;
  }
  // Goals
  for (const g of SEED.goals) {
    const { error } = await a.from('goals').insert({ household_id: hid, ...g });
    if (error) throw error;
  }
  // Fun money
  await a.from('fun_money_settings').insert({ household_id: hid, enabled: true });
  for (const m of SEED.members) {
    const { error } = await a.from('fun_money_people').insert({
      household_id: hid,
      member_id: memberIds[m.key],
      monthly_amount: m.funMoney,
    });
    if (error) throw error;
  }
  // Transactions + activity
  for (const t of SEED.transactions) {
    const { error } = await a.from('transactions').insert({
      household_id: hid,
      member_id: memberIds[t.memberKey],
      amount: t.amount,
      label: t.label,
      category: t.category,
      type: 'expense',
      is_fun_money: t.is_fun_money,
    });
    if (error) throw error;
    await a.from('activity_log').insert({
      household_id: hid,
      text: `${SEED.members.find((m) => m.key === t.memberKey)?.name} spent on ${t.label}`,
      amount: t.amount,
    });
  }
  check('write every entity type as owner', true);

  // ---- Positive read-back as A ----
  console.log('\nVerifying user A can read its own data...');
  for (const table of [
    'households',
    'household_members',
    'income_sources',
    'extra_income',
    'bills',
    'goals',
    'fun_money_settings',
    'fun_money_people',
    'transactions',
    'activity_log',
  ]) {
    // households is keyed by `id`; every other table is scoped by `household_id`.
    const query =
      table === 'households'
        ? a.from(table).select('*').eq('id', hid)
        : a.from(table).select('*').eq('household_id', hid);
    const { data, error } = await query;
    check(`A reads ${table}`, !error && (data?.length ?? 0) > 0, error?.message ?? `${data?.length} rows`);
  }

  // ---- RLS cross-household isolation as B ----
  console.log('\nVerifying user B is blocked from A\'s household (RLS)...');
  for (const table of ['households', 'bills', 'transactions', 'goals', 'household_members']) {
    const query =
      table === 'households'
        ? b.from(table).select('*').eq('id', hid)
        : b.from(table).select('*').eq('household_id', hid);
    const { data, error } = await query;
    check(`B sees 0 rows of A's ${table}`, !error && (data?.length ?? 0) === 0, error?.message ?? `${data?.length} rows`);
  }
  const { error: bWriteErr } = await b
    .from('bills')
    .insert({ household_id: hid, name: 'Intruder bill', amount: 1, category: 'Other' });
  check("B cannot write into A's household", bWriteErr !== null, bWriteErr?.message ?? 'insert unexpectedly succeeded');

  console.log('\n' + (failures === 0 ? 'All checks passed ✅' : `${failures} check(s) FAILED ❌`));
  console.log('\nSeeded login for the app:');
  console.log(`  email:    ${USER_A}`);
  console.log(`  password: ${PASSWORD}`);
}

async function main() {
  const doCleanup = process.argv.includes('--cleanup');
  if (doCleanup) {
    await cleanup();
    return;
  }
  await seed();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nSeed failed:', err.message ?? err);
  process.exit(1);
});
