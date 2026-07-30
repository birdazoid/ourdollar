// Spend-alert push (design-brief §2).
//
// Fired by a Database Webhook on `transactions` INSERT. When a member logs an
// expense, every OTHER household member who has an account, a push token, and
// notify_on_spend = true gets a push naming the spender, amount, category, and
// the updated weekly balance. Solo households / accountless members = no-op.
// The spender never notifies themselves.
//
// Runs with the service role (auto-injected), so it can read every member's
// push_tokens — which row-level security deliberately hides from the client.
//
// Deploy: see supabase/functions/spend-alert/README.md
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import {
  buildSpendAlertBody,
  currentWeekBounds,
  weekFreeToSpend,
  weeklyAllowanceFrom,
} from './logic.ts';

type Transaction = {
  id: string;
  household_id: string;
  member_id: string | null;
  amount: number;
  category: string | null;
  type: 'expense' | 'income';
  is_fun_money: boolean;
  occurred_on: string;
};

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const record: Transaction | undefined = payload.record;

    // Only react to freshly-inserted expenses.
    if (!record || payload.type !== 'INSERT' || record.type !== 'expense') {
      return new Response(JSON.stringify({ skipped: 'not an expense insert' }), { status: 200 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const householdId = record.household_id;

    // Spender (for the name + to exclude their own account).
    const { data: spender } = await supabase
      .from('household_members')
      .select('name, account_id')
      .eq('id', record.member_id ?? '')
      .maybeSingle();
    const spenderName = spender?.name ?? 'Someone';
    const spenderAccount = spender?.account_id ?? null;

    // Recipients: other members with an account + notify_on_spend on.
    const { data: recipients } = await supabase
      .from('household_members')
      .select('account_id')
      .eq('household_id', householdId)
      .eq('notify_on_spend', true)
      .not('account_id', 'is', null);

    const recipientAccounts = (recipients ?? [])
      .map((r) => r.account_id as string)
      .filter((id) => id && id !== spenderAccount);

    if (recipientAccounts.length === 0) {
      return new Response(JSON.stringify({ skipped: 'no recipients' }), { status: 200 });
    }

    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('expo_push_token')
      .in('account_id', recipientAccounts);

    const pushTokens = (tokens ?? []).map((t) => t.expo_push_token as string).filter(Boolean);
    if (pushTokens.length === 0) {
      return new Response(JSON.stringify({ skipped: 'no push tokens' }), { status: 200 });
    }

    // Weekly balance remaining — must match the app's own "free to spend"
    // figure exactly, including planned-category (envelope) reservations and
    // the household's own week-start day, or the push disagrees with the app.
    const [inc, extra, bills, goals, funSettings, funPeople, household] = await Promise.all([
      supabase.from('income_sources').select('amount, frequency').eq('household_id', householdId),
      supabase.from('extra_income').select('amount').eq('household_id', householdId),
      supabase.from('bills').select('paid, paid_amount, amount').eq('household_id', householdId),
      supabase.from('goals').select('monthly_amount').eq('household_id', householdId),
      supabase.from('fun_money_settings').select('enabled').eq('household_id', householdId).maybeSingle(),
      supabase.from('fun_money_people').select('monthly_amount').eq('household_id', householdId),
      supabase.from('households').select('week_start_day').eq('id', householdId).maybeSingle(),
    ]);

    const allowance = weeklyAllowanceFrom({
      income: inc.data ?? [],
      extra: extra.data ?? [],
      bills: bills.data ?? [],
      goals: goals.data ?? [],
      funEnabled: !!funSettings.data?.enabled,
      funPeople: funPeople.data ?? [],
    });

    const weekStartDay = household.data?.week_start_day ?? 0;
    const { start, end } = currentWeekBounds(weekStartDay);
    const [weekTxns, envelopes] = await Promise.all([
      supabase
        .from('transactions')
        .select('amount, type, is_fun_money, category')
        .eq('household_id', householdId)
        .gte('occurred_on', start)
        .lte('occurred_on', end),
      supabase.from('weekly_envelopes').select('category, weekly_amount, skipped_week_start').eq('household_id', householdId),
    ]);

    const remaining = weekFreeToSpend({
      weeklyAllowance: allowance,
      weekTxns: weekTxns.data ?? [],
      envelopes: (envelopes.data ?? []).map((e) => ({
        category: e.category,
        weekly_amount: Number(e.weekly_amount),
        skipped: e.skipped_week_start === start,
      })),
    });
    const body = buildSpendAlertBody({
      spenderName,
      amount: Number(record.amount),
      category: record.category,
      remaining,
    });

    const messages = pushTokens.map((to) => ({ to, title: 'OurDollar', body, sound: 'default' }));

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    const result = await res.json();

    return new Response(JSON.stringify({ sent: messages.length, body, result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('spend-alert error', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
