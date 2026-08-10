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
  adjustedWeeklyAllowance,
  billVarianceFrom,
  buildSpendAlertBody,
  currentPeriod,
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

    const weekStartDay = household.data?.week_start_day ?? 0;
    const billRows = bills.data ?? [];
    // Anchor every date calculation to the expense's own occurred_on, which the
    // app writes as the household's LOCAL date. Using the server's UTC clock
    // meant an expense logged on a US evening was dated tomorrow, and on the
    // last day of a week or period the push reported a different week than the
    // one the Week screen was showing.
    const anchor = record.occurred_on;
    // The month's pool is split across its period's real week count (4 or 5),
    // not a fixed 4, matching the app.
    const period = currentPeriod(weekStartDay, anchor);
    const plannedWeekly = weeklyAllowanceFrom(
      {
        income: inc.data ?? [],
        extra: extra.data ?? [],
        bills: billRows,
        goals: goals.data ?? [],
        funEnabled: !!funSettings.data?.enabled,
        funPeople: funPeople.data ?? [],
      },
      period.weeks
    );
    // Bills that came in over/under their estimate land on the weeks that are
    // left, same as the app does. Otherwise the push quotes a figure the
    // household's own Week screen disagrees with.
    const allowance = adjustedWeeklyAllowance({
      plannedWeekly,
      billVariance: billVarianceFrom({ bills: billRows }),
      weeksRemaining: period.weeksRemaining,
    });

    const { start, end } = currentWeekBounds(weekStartDay, anchor);
    const [weekTxns, envelopes, rollovers] = await Promise.all([
      supabase
        .from('transactions')
        .select('amount, type, is_fun_money, category')
        .eq('household_id', householdId)
        .gte('occurred_on', start)
        .lte('occurred_on', end),
      supabase.from('weekly_envelopes').select('category, weekly_amount, skipped_week_start').eq('household_id', householdId),
      // Money the household chose to carry into this week when they settled
      // last week's leftover/overage. Negative when last week ran over. The
      // Week screen adds this to its allowance, so the push has to as well.
      supabase
        .from('week_rollovers')
        .select('applied_amount')
        .eq('household_id', householdId)
        .eq('to_week_start', start),
    ]);

    const remaining = weekFreeToSpend({
      weeklyAllowance: allowance,
      weekTxns: weekTxns.data ?? [],
      envelopes: (envelopes.data ?? []).map((e) => ({
        category: e.category,
        weekly_amount: Number(e.weekly_amount),
        skipped: e.skipped_week_start === start,
      })),
      carriedIn: (rollovers.data ?? []).reduce((a, r) => a + Number(r.applied_amount), 0),
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
