/**
 * Screenshot/marketing demo seed for OurDollar.
 *
 * Creates one confirmed test account with a full, good-looking household —
 * every bill category, a mix of new-icon and emoji goals, planned spending,
 * and a week of varied transactions — so you can sign in and take App Store /
 * website screenshots without showing any real data.
 *
 * Run:   npm run seed:demo              (create/reset the demo account)
 *        npm run seed:demo -- --cleanup (delete the demo account + all its data)
 *
 * Requires .env.seed (gitignored) with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY,
 * and .env with EXPO_PUBLIC_SUPABASE_ANON_KEY. Safe to re-run — it wipes and
 * recreates the demo account each time.
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

const PASSWORD = 'ourdollar-demo-pw-1';
const EMAIL = 'ourdollar-demo@example.com';

const today = new Date();
const daysAgo = (n: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

const SEED = {
  householdName: 'Cooper Household',
  householdColor: 'sage',
  account: { name: 'Jamie', avatar: 'alien' },
  members: [
    { key: 'jamie', name: 'Jamie', avatar: 'alien', isAdmin: true, hasAccount: true, funMoney: 120 },
    { key: 'sam', name: 'Sam', avatar: 'saucer', isAdmin: false, hasAccount: false, funMoney: 90 },
    { key: 'robin', name: 'Robin', avatar: 'blobbert', isAdmin: false, hasAccount: false, funMoney: 40 },
  ],
  income: [
    { memberKey: 'jamie', amount: 2600, frequency: 'semimonthly' as const },
    { memberKey: 'sam', amount: 3200, frequency: 'monthly' as const },
  ],
  extraIncome: [{ source: 'Freelance design', amount: 250, memberKey: 'jamie' }],
  // One bill per BILL_CATS category, mixed paid/unpaid, so the Bills tab shows every icon.
  bills: [
    { name: 'Rent', category: 'Housing', amount: 1800, due_day: 1, paidByKey: 'jamie' },
    { name: 'Car loan', category: 'Loans', amount: 340, due_day: 5 },
    { name: 'Electric & gas', category: 'Bills & Utilities', amount: 145, due_day: 12, varies: true },
    { name: "Robin's swim class", category: 'Kids', amount: 60, due_day: 15 },
    { name: 'Streaming bundle', category: 'Subscriptions', amount: 32, due_day: 3, paidByKey: 'jamie' },
    { name: 'Dental insurance', category: 'Medical', amount: 85, due_day: 20 },
    { name: 'College fund', category: 'Education', amount: 150, due_day: 18 },
    { name: 'Local shelter', category: 'Donations', amount: 25, due_day: 10, paidByKey: 'sam' },
    { name: 'Gym membership', category: 'Other', amount: 40, due_day: 22 },
  ],
  goals: [
    { name: 'Down payment', emoji: '🏠', target_amount: 20000, monthly_amount: 500, saved_amount: 6500 },
    { name: 'Emergency fund', emoji: null, target_amount: 5000, monthly_amount: 300, saved_amount: 2100 },
    { name: 'Anniversary trip', emoji: '✈️', target_amount: 2000, monthly_amount: 150, saved_amount: 900 },
    { name: 'Vet fund', emoji: '🐾', target_amount: 800, monthly_amount: 50, saved_amount: 200 },
    { name: 'Grad school', emoji: '🎓', target_amount: 10000, monthly_amount: 400, saved_amount: 3200 },
  ],
  envelopes: [
    { category: 'groceries', weekly_amount: 220 },
    { category: 'fuel', weekly_amount: 60 },
    { category: 'dining', weekly_amount: 80 },
    { category: 'entertainment', weekly_amount: 50 },
    { category: 'pets', weekly_amount: 30 },
  ],
  transactions: [
    { label: 'Groceries', amount: 54.2, memberKey: 'jamie', category: 'groceries', is_fun_money: false, day: 0 },
    { label: 'Coffee run', amount: 6.75, memberKey: 'sam', category: 'dining', is_fun_money: true, day: 0 },
    { label: 'Gas', amount: 42.1, memberKey: 'jamie', category: 'fuel', is_fun_money: false, day: 1 },
    { label: 'Movie night', amount: 28, memberKey: 'sam', category: 'entertainment', is_fun_money: true, day: 1 },
    { label: 'Pet food', amount: 22.3, memberKey: 'jamie', category: 'pets', is_fun_money: false, day: 2 },
    { label: 'Lunch out', amount: 15.5, memberKey: 'sam', category: 'dining', is_fun_money: false, day: 2 },
    { label: 'Household supplies', amount: 18.9, memberKey: 'robin', category: 'household', is_fun_money: false, day: 3 },
    { label: 'New shoes', amount: 45, memberKey: 'sam', category: 'personal', is_fun_money: true, day: 3 },
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
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw error;
  return data.users.find((u) => u.email === email) ?? null;
}

async function ensureUser(email: string): Promise<string> {
  const existing = await findUserByEmail(email);
  if (existing) await admin.auth.admin.deleteUser(existing.id);
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  return data.user.id;
}

async function cleanup() {
  const u = await findUserByEmail(EMAIL);
  if (u) await admin.auth.admin.deleteUser(u.id);
  console.log('Deleted demo account and all its data.');
}

async function seed() {
  console.log('Creating demo account...');
  const uid = await ensureUser(EMAIL);

  const { error: acctErr } = await admin
    .from('accounts')
    .update({ name: SEED.account.name, avatar: SEED.account.avatar, onboarded: true })
    .eq('id', uid);
  if (acctErr) throw acctErr;

  const client = userClient();
  const { error: signInErr } = await client.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (signInErr) throw signInErr;

  console.log('Writing household...');
  const { data: household, error: hErr } = await client
    .from('households')
    .insert({ name: SEED.householdName, owner_account_id: uid, color: SEED.householdColor })
    .select()
    .single();
  if (hErr) throw hErr;
  const hid = household.id;

  const memberIds: Record<string, string> = {};
  for (const m of SEED.members) {
    const { data, error } = await client
      .from('household_members')
      .insert({
        household_id: hid,
        account_id: m.hasAccount ? uid : null,
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

  for (const i of SEED.income) {
    const { error } = await client
      .from('income_sources')
      .insert({ household_id: hid, member_id: memberIds[i.memberKey], amount: i.amount, frequency: i.frequency });
    if (error) throw error;
  }
  for (const x of SEED.extraIncome) {
    const { error } = await client
      .from('extra_income')
      .insert({ household_id: hid, member_id: memberIds[x.memberKey], source: x.source, amount: x.amount });
    if (error) throw error;
  }
  for (const bl of SEED.bills) {
    const paid = 'paidByKey' in bl && bl.paidByKey;
    const { error } = await client.from('bills').insert({
      household_id: hid,
      name: bl.name,
      category: bl.category,
      amount: bl.amount,
      due_day: bl.due_day,
      varies: 'varies' in bl ? bl.varies : false,
      paid: !!paid,
      paid_amount: paid ? bl.amount : null,
      paid_by_member_id: paid ? memberIds[bl.paidByKey as string] : null,
      paid_on: paid ? daysAgo(0) : null,
    });
    if (error) throw error;
  }
  for (const g of SEED.goals) {
    const { error } = await client.from('goals').insert({ household_id: hid, ...g });
    if (error) throw error;
  }
  const { error: funErr } = await client.from('fun_money_settings').insert({ household_id: hid, enabled: true });
  if (funErr) throw funErr;
  for (const m of SEED.members) {
    const { error } = await client
      .from('fun_money_people')
      .insert({ household_id: hid, member_id: memberIds[m.key], monthly_amount: m.funMoney });
    if (error) throw error;
  }
  for (const e of SEED.envelopes) {
    const { error } = await client
      .from('weekly_envelopes')
      .insert({ household_id: hid, category: e.category, weekly_amount: e.weekly_amount });
    if (error) throw error;
  }
  for (const t of SEED.transactions) {
    const { error } = await client.from('transactions').insert({
      household_id: hid,
      member_id: memberIds[t.memberKey],
      amount: t.amount,
      label: t.label,
      category: t.category,
      type: 'expense',
      is_fun_money: t.is_fun_money,
      occurred_on: daysAgo(t.day),
    });
    if (error) throw error;
    const { error: logErr } = await client.from('activity_log').insert({
      household_id: hid,
      text: `${SEED.members.find((m) => m.key === t.memberKey)?.name} spent on ${t.label}`,
      amount: t.amount,
    });
    if (logErr) throw logErr;
  }

  console.log('\nDone. Demo login for the app:');
  console.log(`  email:    ${EMAIL}`);
  console.log(`  password: ${PASSWORD}`);
}

async function main() {
  if (process.argv.includes('--cleanup')) {
    await cleanup();
    return;
  }
  await seed();
}

main().catch((err) => {
  console.error('\nSeed failed:', err.message ?? err);
  process.exit(1);
});
