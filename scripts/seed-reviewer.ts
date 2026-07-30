/**
 * Creates (or resets) a dedicated Apple App Review demo account — separate
 * from the ourdollar-seed+primary/other accounts used by the automated
 * verify:* scripts, so a script re-run never changes what a reviewer sees
 * mid-review. Populates a realistic single-household budget (income, bills,
 * goals, fun money, an envelope, and recent transactions) so the reviewer
 * lands straight in the populated app instead of the onboarding wizard.
 *
 * Run:   npm run seed:reviewer            (create/reset + verify)
 *        npm run seed:reviewer -- --cleanup   (delete the reviewer account)
 *
 * Requires .env.seed (gitignored) with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.seed' });
loadEnv({ path: '.env' });

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing env. Need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.seed.');
  process.exit(1);
}

const EMAIL = 'apple-review@ourdollar.app';
const PASSWORD = 'OurDollarReview-2026!';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(email: string) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw error;
  return data.users.find((u) => u.email === email) ?? null;
}

async function cleanup() {
  const u = await findUserByEmail(EMAIL);
  if (u) {
    await admin.auth.admin.deleteUser(u.id);
    console.log(`Deleted reviewer account (${EMAIL}) and all its data.`);
  } else {
    console.log('No reviewer account found — nothing to delete.');
  }
}

async function seed() {
  const existing = await findUserByEmail(EMAIL);
  if (existing) {
    // Wipe prior data for a clean, repeatable run (cascades to household + all its data).
    await admin.auth.admin.deleteUser(existing.id);
  }

  console.log('Creating reviewer account...');
  const { data: userData, error: userErr } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (userErr) throw userErr;
  const accountId = userData.user.id;

  // The on_auth_user_created trigger already inserted a bare accounts row
  // (id, email) — fill in the profile so RootGate skips ProfileSetup, and
  // mark onboarded so the app lands straight on /week.
  const { error: acctErr } = await admin
    .from('accounts')
    .update({ name: 'App Reviewer', avatar: 'alien', onboarded: true })
    .eq('id', accountId);
  if (acctErr) throw acctErr;

  console.log('Writing sample household...');
  const { data: household, error: hErr } = await admin
    .from('households')
    .insert({ name: 'Sample Household', owner_account_id: accountId })
    .select()
    .single();
  if (hErr) throw hErr;
  const hid = household.id;

  const { data: owner, error: ownerErr } = await admin
    .from('household_members')
    .insert({
      household_id: hid,
      account_id: accountId,
      name: 'App Reviewer',
      avatar: 'alien',
      is_admin: true,
      has_account: true,
    })
    .select()
    .single();
  if (ownerErr) throw ownerErr;

  const { data: partner, error: partnerErr } = await admin
    .from('household_members')
    .insert({
      household_id: hid,
      account_id: null,
      name: 'Partner',
      avatar: 'saucer',
      is_admin: false,
      has_account: false,
    })
    .select()
    .single();
  if (partnerErr) throw partnerErr;

  const { error: incomeErr } = await admin.from('income_sources').insert([
    { household_id: hid, member_id: owner.id, amount: 3200, frequency: 'semimonthly' },
    { household_id: hid, member_id: partner.id, amount: 2000, frequency: 'monthly' },
  ]);
  if (incomeErr) throw incomeErr;

  // Inserted one at a time — a batched insert() with inconsistent keys across
  // rows sends explicit nulls for missing columns instead of using column
  // defaults, which trips the not-null constraint on varies/paid.
  type BillRow = {
    household_id: string;
    name: string;
    category: string;
    amount: number;
    due_day: number;
    varies: boolean;
    paid: boolean;
    paid_amount: number | null;
    paid_by_member_id: string | null;
    paid_on: string | null;
  };
  const billRows: BillRow[] = [
    {
      household_id: hid,
      name: 'Rent',
      category: 'Housing',
      amount: 1400,
      due_day: 1,
      varies: false,
      paid: false,
      paid_amount: null,
      paid_by_member_id: null,
      paid_on: null,
    },
    {
      household_id: hid,
      name: 'Electric',
      category: 'Bills & Utilities',
      amount: 110,
      due_day: 12,
      varies: true,
      paid: false,
      paid_amount: null,
      paid_by_member_id: null,
      paid_on: null,
    },
    {
      household_id: hid,
      name: 'Streaming',
      category: 'Subscriptions',
      amount: 15,
      due_day: 5,
      varies: false,
      paid: true,
      paid_amount: 15,
      paid_by_member_id: owner.id,
      paid_on: new Date().toISOString().slice(0, 10),
    },
  ];
  for (const bill of billRows) {
    const { error } = await admin.from('bills').insert(bill);
    if (error) throw error;
  }

  const { error: goalsErr } = await admin.from('goals').insert([
    { household_id: hid, name: 'Emergency Fund', emoji: null, target_amount: 5000, monthly_amount: 250, saved_amount: 1200 },
    { household_id: hid, name: 'Vacation', emoji: '✈️', target_amount: 2000, monthly_amount: 150, saved_amount: 400 },
  ]);
  if (goalsErr) throw goalsErr;

  const { error: fmSettingsErr } = await admin.from('fun_money_settings').insert({ household_id: hid, enabled: true });
  if (fmSettingsErr) throw fmSettingsErr;
  const { error: fmPeopleErr } = await admin.from('fun_money_people').insert([
    { household_id: hid, member_id: owner.id, monthly_amount: 100 },
    { household_id: hid, member_id: partner.id, monthly_amount: 75 },
  ]);
  if (fmPeopleErr) throw fmPeopleErr;

  const { error: envelopeErr } = await admin
    .from('weekly_envelopes')
    .insert({ household_id: hid, category: 'groceries', weekly_amount: 150 });
  if (envelopeErr) throw envelopeErr;

  const transactions = [
    { member_id: owner.id, amount: 62.5, label: 'Groceries', category: 'groceries', is_fun_money: false },
    { member_id: partner.id, amount: 6.25, label: 'Coffee', category: 'dining', is_fun_money: true },
    { member_id: owner.id, amount: 38.0, label: 'Gas', category: 'transportation', is_fun_money: false },
  ];
  for (const t of transactions) {
    const { error: txErr } = await admin.from('transactions').insert({ household_id: hid, type: 'expense', ...t });
    if (txErr) throw txErr;
    const { error: logErr } = await admin.from('activity_log').insert({
      household_id: hid,
      text: `${t.member_id === owner.id ? 'App Reviewer' : 'Partner'} spent on ${t.label}`,
      amount: t.amount,
    });
    if (logErr) throw logErr;
  }

  console.log('\nReviewer demo account ready ✅');
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
  console.error('\nseed-reviewer failed:', err.message ?? err);
  process.exit(1);
});
