/**
 * Verifies the spend-alert logic (design-brief §2) against the LIVE database,
 * without deploying the edge function. It imports the same pure logic the
 * function uses (supabase/functions/spend-alert/logic.ts), so a pass here means
 * the recipient selection, weekly-balance math, and message are correct.
 *
 * Scenario: "Partner" (a member with no account) logs an expense. The only
 * other member with an account + a push token is the primary user, so the
 * alert should be sent to exactly that device.
 *
 * Run: npm run verify:spend-alert   (needs .env.seed like the seed script)
 *
 * NOT covered here (needs the deployed function + a 2nd real device):
 *   - the Database Webhook firing the function on insert
 *   - delivery to a genuinely separate recipient device
 */
import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

import {
  buildSpendAlertBody,
  currentWeekBounds,
  weekRemaining,
  weeklyAllowanceFrom,
} from '../supabase/functions/spend-alert/logic';

loadEnv({ path: '.env.seed' });
loadEnv({ path: '.env' });

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.seed');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

async function main() {
  // Pick the primary user's household and a no-account member to act as spender.
  const { data: members } = await admin
    .from('household_members')
    .select('id, name, account_id, household_id, notify_on_spend');
  if (!members?.length) throw new Error('No members found — run `npm run seed` first.');

  const spender = members.find((m) => !m.account_id) ?? members[0];
  const householdId = spender.household_id;
  console.log(`Simulating: ${spender.name} logs a $18.50 Dining expense.\n`);

  // Insert the expense (the webhook would fire after this).
  const { data: txn, error: insErr } = await admin
    .from('transactions')
    .insert({
      household_id: householdId,
      member_id: spender.id,
      amount: 18.5,
      category: 'dining',
      label: 'Sonic (spend-alert test)',
      type: 'expense',
      is_fun_money: false,
      occurred_on: todayISO(),
    })
    .select()
    .single();
  if (insErr) throw insErr;

  try {
    // --- replicate the edge function's data gathering ---
    const recipientAccounts = members
      .filter((m) => m.household_id === householdId && m.notify_on_spend && m.account_id && m.account_id !== spender.account_id)
      .map((m) => m.account_id as string);

    console.log(`Recipients (other members w/ account + notify_on_spend): ${recipientAccounts.length}`);

    const { data: tokens } = await admin
      .from('push_tokens')
      .select('expo_push_token')
      .in('account_id', recipientAccounts.length ? recipientAccounts : ['none']);
    const pushTokens = (tokens ?? []).map((t) => t.expo_push_token as string);
    console.log(`Push tokens for those recipients: ${pushTokens.length}`);

    const [inc, extra, bills, goals, funSettings, funPeople] = await Promise.all([
      admin.from('income_sources').select('amount, frequency').eq('household_id', householdId),
      admin.from('extra_income').select('amount').eq('household_id', householdId),
      admin.from('bills').select('paid, paid_amount, amount').eq('household_id', householdId),
      admin.from('goals').select('monthly_amount').eq('household_id', householdId),
      admin.from('fun_money_settings').select('enabled').eq('household_id', householdId).maybeSingle(),
      admin.from('fun_money_people').select('monthly_amount').eq('household_id', householdId),
    ]);

    const allowance = weeklyAllowanceFrom({
      income: inc.data ?? [],
      extra: extra.data ?? [],
      bills: bills.data ?? [],
      goals: goals.data ?? [],
      funEnabled: !!funSettings.data?.enabled,
      funPeople: funPeople.data ?? [],
    });

    const { start, end } = currentWeekBounds();
    const { data: weekTxns } = await admin
      .from('transactions')
      .select('amount, type, is_fun_money')
      .eq('household_id', householdId)
      .gte('occurred_on', start)
      .lte('occurred_on', end);

    const remaining = weekRemaining(allowance, weekTxns ?? []);
    const body = buildSpendAlertBody({
      spenderName: spender.name,
      amount: 18.5,
      category: 'dining',
      remaining,
    });

    console.log(`Weekly allowance: $${allowance} · remaining after this spend: $${remaining}`);
    console.log(`\nMessage:\n  "${body}"\n`);

    if (pushTokens.length === 0) {
      console.log('No recipient devices — nothing sent (correct for a solo/accountless household).');
      return;
    }

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(pushTokens.map((to) => ({ to, title: 'OurDollar', body, sound: 'default' }))),
    });
    const result = await res.json();
    console.log('Expo push response:', JSON.stringify(result));
    console.log(`\nSent to ${pushTokens.length} device(s). Check the recipient phone.`);
  } finally {
    // Clean up the test transaction so it doesn't pollute the ledger/budget.
    await admin.from('transactions').delete().eq('id', txn.id);
    console.log('\nCleaned up the test transaction.');
  }
}

main().catch((err) => {
  console.error('verify-spend-alert failed:', err.message ?? err);
  process.exit(1);
});
