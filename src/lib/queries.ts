import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { splitIncome } from '@/lib/money';
import { supabase } from '@/lib/supabase';
import type {
  Account,
  Bill,
  BillCarryover,
  BillMonthLine,
  CatchUpEntry,
  EmergencyFundEntry,
  EmergencyFundSettings,
  ExtraIncome,
  FunMoneyPerson,
  FunMoneySettings,
  Goal,
  HouseholdMember,
  IncomeDestination,
  IncomeSource,
  MonthSnapshot,
  Transaction,
  WeeklyEnvelope,
} from '@/lib/types';

/** Fetches all rows of a household-scoped table, newest first where sensible. */
function householdListQuery<T>(table: string, householdId: string | null, order = 'created_at') {
  return {
    queryKey: [table, householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<T[]> => {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('household_id', householdId!)
        .order(order, { ascending: false });
      if (error) throw error;
      return data as T[];
    },
  };
}

export const useMembers = (householdId: string | null) =>
  useQuery(householdListQuery<HouseholdMember>('household_members', householdId, 'created_at'));

// Every member across all of the caller's households (RLS scopes to households
// they belong to). Used by Profile to show each household's roster.
export const useAllMembers = () =>
  useQuery({
    queryKey: ['household_members', 'all'],
    queryFn: async (): Promise<HouseholdMember[]> => {
      const { data, error } = await supabase
        .from('household_members')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as HouseholdMember[];
    },
  });

export const useIncome = (householdId: string | null) =>
  useQuery(householdListQuery<IncomeSource>('income_sources', householdId));

export const useExtraIncome = (householdId: string | null) =>
  useQuery(householdListQuery<ExtraIncome>('extra_income', householdId));

export const useBills = (householdId: string | null) =>
  useQuery(householdListQuery<Bill>('bills', householdId));

export const useGoals = (householdId: string | null) =>
  useQuery(householdListQuery<Goal>('goals', householdId));

// Transactions ordered newest-occurred first; filtered to a week client-side.
export const useTransactions = (householdId: string | null) =>
  useQuery(householdListQuery<Transaction>('transactions', householdId, 'occurred_on'));

// fun_money_people has no created_at column — order by id instead.
export const useFunPeople = (householdId: string | null) =>
  useQuery(householdListQuery<FunMoneyPerson>('fun_money_people', householdId, 'id'));

export const useEnvelopes = (householdId: string | null) =>
  useQuery(householdListQuery<WeeklyEnvelope>('weekly_envelopes', householdId, 'created_at'));

export const useFunSettings = (householdId: string | null) =>
  useQuery({
    queryKey: ['fun_money_settings', householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<FunMoneySettings | null> => {
      const { data, error } = await supabase
        .from('fun_money_settings')
        .select('*')
        .eq('household_id', householdId!)
        .maybeSingle();
      if (error) throw error;
      return data as FunMoneySettings | null;
    },
  });

// ---- Income mutations ----

export type IncomeInput = {
  member_id: string | null;
  amount: number;
  frequency: IncomeSource['frequency'];
};

export function useIncomeMutations(householdId: string | null) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['income_sources', householdId] });

  const create = useMutation({
    mutationFn: async (input: IncomeInput) => {
      const { error } = await supabase
        .from('income_sources')
        .insert({ household_id: householdId, ...input });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, ...input }: IncomeInput & { id: string }) => {
      const { error } = await supabase.from('income_sources').update(input).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('income_sources').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { create, update, remove };
}

export type ExtraIncomeInput = {
  member_id: string | null;
  source: string;
  amount: number;
  occurred_on: string;
};

/** One-off income (a bonus, a refund, a side job) — counts toward this month
 *  only, unlike a recurring income source. */
export function useExtraIncomeMutations(householdId: string | null) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['extra_income', householdId] });

  const create = useMutation({
    mutationFn: async (input: ExtraIncomeInput) => {
      const { error } = await supabase
        .from('extra_income')
        .insert({ household_id: householdId, ...input });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, ...input }: ExtraIncomeInput & { id: string }) => {
      const { error } = await supabase.from('extra_income').update(input).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('extra_income').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { create, update, remove };
}

// ---- Fun money mutations ----

export function useFunMoneyMutations(householdId: string | null) {
  const qc = useQueryClient();

  const setEnabled = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from('fun_money_settings')
        .upsert({ household_id: householdId, enabled }, { onConflict: 'household_id' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fun_money_settings', householdId] }),
  });

  const setPersonAmount = useMutation({
    mutationFn: async ({ id, monthly_amount }: { id: string; monthly_amount: number }) => {
      const { error } = await supabase
        .from('fun_money_people')
        .update({ monthly_amount })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fun_money_people', householdId] }),
  });

  return { setEnabled, setPersonAmount };
}

// ---- Weekly envelope mutations ("planned spending") ----

export type EnvelopeDraft = { category: string; weekly_amount: number };

export function useEnvelopeMutations(householdId: string | null) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['weekly_envelopes', householdId] });

  const add = useMutation({
    mutationFn: async (draft: EnvelopeDraft) => {
      const { error } = await supabase
        .from('weekly_envelopes')
        .insert({ household_id: householdId, ...draft });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, weekly_amount }: { id: string; weekly_amount: number }) => {
      const { error } = await supabase
        .from('weekly_envelopes')
        .update({ weekly_amount })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('weekly_envelopes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  // Skip (or un-skip) an envelope for a given week. `weekStart` is that week's
  // start date (YYYY-MM-DD); null clears the skip.
  const setSkip = useMutation({
    mutationFn: async ({ id, weekStart }: { id: string; weekStart: string | null }) => {
      const { error } = await supabase
        .from('weekly_envelopes')
        .update({ skipped_week_start: weekStart })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { add, update, remove, setSkip };
}

// ---- Bill mutations ----

export type BillInput = {
  name: string;
  amount: number | null;
  category: string;
  due_day: number;
  varies: boolean;
};

export function useBillMutations(householdId: string | null) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['bills', householdId] });

  const create = useMutation({
    mutationFn: async (input: BillInput) => {
      const { error } = await supabase.from('bills').insert({ household_id: householdId, ...input });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, ...input }: BillInput & { id: string }) => {
      const { error } = await supabase.from('bills').update(input).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('bills').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const markPaid = useMutation({
    mutationFn: async ({
      id,
      paidAmount,
      paidByMemberId,
    }: {
      id: string;
      paidAmount: number;
      paidByMemberId: string | null;
    }) => {
      const { error } = await supabase
        .from('bills')
        .update({
          paid: true,
          paid_amount: paidAmount,
          paid_by_member_id: paidByMemberId,
          paid_on: new Date().toISOString().slice(0, 10),
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { create, update, remove, markPaid };
}

// ---- End-of-month review ----

/** Closed months' full budget-plan + bill snapshots, newest first. */
export function useMonthSnapshots(householdId: string | null) {
  return useQuery({
    queryKey: ['month_snapshots', householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<MonthSnapshot[]> => {
      const { data, error } = await supabase
        .from('month_snapshots')
        .select('*')
        .eq('household_id', householdId!)
        .order('month', { ascending: false });
      if (error) throw error;
      return data as MonthSnapshot[];
    },
  });
}

/** Unresolved "unpaid from last month" reminders, for the Bills screen. */
export function useBillCarryovers(householdId: string | null) {
  return useQuery({
    queryKey: ['bill_carryovers', householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<BillCarryover[]> => {
      const { data, error } = await supabase
        .from('bill_carryovers')
        .select('*')
        .eq('household_id', householdId!)
        .eq('resolved', false)
        .order('from_month', { ascending: false });
      if (error) throw error;
      return data as BillCarryover[];
    },
  });
}

export type CloseMonthInput = {
  month: string; // the month being closed, 'YYYY-MM-01'
  totalIncome: number;
  totalFixed: number;
  goalsMonthly: number;
  goalsSavedTotal: number;
  funTotal: number;
  weeklyAllowance: number;
  emergencyMonthly: number;
};

/**
 * Closes out a month in ONE atomic call (see the close_month migration): writes
 * the plan+bill snapshot, auto-creates a carryover reminder for every bill still
 * unpaid, resets every bill for the fresh cycle, and clears goals'
 * paid_this_month. Either all of that lands or none of it does — a half-closed
 * month would otherwise strand bills permanently, since the review month is
 * considered done as soon as its snapshot exists.
 *
 * Bill figures and carryovers are derived server-side from the very rows being
 * reset, so the snapshot can't disagree with the reset. Called automatically by
 * MonthAutoClose the moment a new month is detected, which is what makes bills
 * reset even if the household never opens the review wizard.
 */
export function useCloseMonth(householdId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CloseMonthInput): Promise<string> => {
      const { data, error } = await supabase.rpc('close_month', {
        p_household_id: householdId,
        p_month: input.month,
        p_total_income: input.totalIncome,
        p_total_fixed: input.totalFixed,
        p_goals_monthly: input.goalsMonthly,
        p_goals_saved_total: input.goalsSavedTotal,
        p_fun_total: input.funTotal,
        p_weekly_allowance: input.weeklyAllowance,
        p_emergency_monthly: input.emergencyMonthly,
      });
      if (error) throw error;
      return (data as string) ?? 'closed';
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bills', householdId] });
      qc.invalidateQueries({ queryKey: ['goals', householdId] });
      qc.invalidateQueries({ queryKey: ['month_snapshots', householdId] });
      qc.invalidateQueries({ queryKey: ['bill_carryovers', householdId] });
    },
  });
}

/**
 * Resolves a carried-over bill as paid or dismissed. Paid-vs-dismissed is an
 * explicit flag rather than "is the amount null?", so a varies-amount bill can
 * still be marked genuinely paid (it credits the count; the unknown amount adds
 * nothing). Paying retroactively credits the ORIGINAL month it was owed for,
 * however much later it happens.
 */
export function useResolveCarryover(householdId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      markPaid: boolean;
      paidAmount?: number | null;
      settledByMemberId?: string | null;
    }) => {
      const { error } = await supabase.rpc('resolve_carryover', {
        p_carryover_id: input.id,
        p_mark_paid: input.markPaid,
        p_paid_amount: input.markPaid ? (input.paidAmount ?? null) : null,
        p_settled_by_member_id: input.settledByMemberId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bill_carryovers', householdId] });
      qc.invalidateQueries({ queryKey: ['month_snapshots', householdId] });
    },
  });
}

// ---- Goal mutations ----

export type GoalInput = {
  name: string;
  emoji: string;
  target_amount: number;
  monthly_amount: number;
};

export function useGoalMutations(householdId: string | null) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['goals', householdId] });

  const create = useMutation({
    mutationFn: async (input: GoalInput) => {
      const { error } = await supabase.from('goals').insert({ household_id: householdId, ...input });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, ...input }: GoalInput & { id: string }) => {
      const { error } = await supabase.from('goals').update(input).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('goals').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  // "Mark paid" = add this month's contribution toward the goal.
  const contribute = useMutation({
    mutationFn: async ({
      id,
      saved_amount,
      target_amount,
      monthly_amount,
    }: {
      id: string;
      saved_amount: number;
      target_amount: number;
      monthly_amount: number;
    }) => {
      const { error } = await supabase
        .from('goals')
        .update({
          saved_amount: Math.min(target_amount, saved_amount + monthly_amount),
          paid_this_month: true,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { create, update, remove, contribute };
}

// ---- Transaction mutations ----

export type TransactionInput = {
  member_id: string | null;
  amount: number;
  category: string | null;
  label: string;
  type: 'expense' | 'income';
  is_fun_money: boolean;
  occurred_on: string;
  /** Income only. Null/'this_week' is the only value that raises the week. */
  income_destination?: IncomeDestination | null;
};

export function useTransactionMutations(householdId: string | null) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['transactions', householdId] });

  const create = useMutation({
    mutationFn: async (input: TransactionInput) => {
      const { error } = await supabase
        .from('transactions')
        .insert({ household_id: householdId, ...input });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, ...input }: TransactionInput & { id: string }) => {
      const { error } = await supabase.from('transactions').update(input).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('transactions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  /**
   * Logs income AND applies wherever it was assigned, as one operation.
   *
   * The transaction row always exists, so the money is visible in the ledger on
   * the day it arrived. What changes is what else happens: only 'this_week'
   * raises the week's spending money, and the other destinations move the
   * matching balance instead.
   *
   * One mutation rather than two awaited calls in the screen, so a failure is
   * reported once and the household isn't left guessing which half landed.
   */
  const logIncome = useMutation({
    mutationFn: async (args: {
      input: TransactionInput;
      goal?: { id: string; saved_amount: number; target_amount: number };
      /** What's currently behind, so catch-up can't be overpaid. */
      catchUpOwed?: number;
      memberId?: string | null;
    }) => {
      const { input, goal, memberId } = args;
      const dest = input.income_destination ?? 'this_week';
      const amount = Math.abs(input.amount);

      /**
       * How much the chosen destination can actually absorb.
       *
       * Catch-up and goals both have a ceiling, and sending more than that
       * used to make the excess vanish: the whole amount was written as a
       * payment, catchUpBalance floored the result at zero, and the leftover
       * sat in no week, no goal and no month. Worse, the raw sum stayed
       * negative, so a later overspend was silently swallowed by a credit
       * nobody could see. "this_week" and "month" have no ceiling.
       */
      const room =
        dest === 'catch_up'
          ? Math.max(0, args.catchUpOwed ?? 0)
          : dest === 'goal' && goal
            ? Math.max(0, goal.target_amount - goal.saved_amount)
            : // this_week, month and the emergency fund all take everything;
              // a fund you can fill up isn't an emergency fund.
              amount;

      const { applied, overflow } = splitIncome(amount, room);

      /**
       * Anything the destination can't take becomes its own row headed for
       * this week, rather than disappearing. Two rows instead of one column
       * on the transaction: each row keeps a single honest destination, they
       * add up to what arrived, and the ledger explains itself because each
       * one already prints where it went.
       */
      const rows = [
        ...(applied > 0 ? [{ household_id: householdId, ...input, amount: applied }] : []),
        ...(overflow > 0
          ? [
              {
                household_id: householdId,
                ...input,
                amount: overflow,
                income_destination: 'this_week' as const,
              },
            ]
          : []),
      ];
      if (rows.length === 0) return;

      const { error } = await supabase.from('transactions').insert(rows);
      if (error) throw error;

      if (dest === 'catch_up' && applied > 0) {
        const { error: cErr } = await supabase.from('catchup_entries').insert({
          household_id: householdId,
          amount: -applied,
          kind: 'payment',
          note: input.label || 'Money in',
          created_by_member_id: memberId ?? input.member_id ?? null,
        });
        if (cErr) throw cErr;
      }

      if (dest === 'goal' && goal && applied > 0) {
        const next = Math.round((goal.saved_amount + applied) * 100) / 100;
        const { error: gErr } = await supabase
          .from('goals')
          .update({ saved_amount: next })
          .eq('id', goal.id);
        if (gErr) throw gErr;
      }

      if (dest === 'emergency_fund' && applied > 0) {
        const { error: fErr } = await supabase.from('emergency_fund_entries').insert({
          household_id: householdId,
          amount: applied,
          kind: 'deposit',
          note: input.label || 'Money in',
          created_by_member_id: memberId ?? input.member_id ?? null,
        });
        if (fErr) throw fErr;
      }

      if (dest === 'month') {
        const { error: eErr } = await supabase.from('extra_income').insert({
          household_id: householdId,
          member_id: input.member_id,
          source: input.label || 'Extra income',
          amount: applied,
          occurred_on: input.occurred_on,
        });
        if (eErr) throw eErr;
      }
    },
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['catchup_entries', householdId] });
      qc.invalidateQueries({ queryKey: ['emergency_fund_entries', householdId] });
      qc.invalidateQueries({ queryKey: ['goals', householdId] });
      qc.invalidateQueries({ queryKey: ['extra_income', householdId] });
    },
  });

  return { create, update, remove, logIncome };
}

// ---- Account (subscription + onboarding state) ----

/** The caller's own accounts row (RLS scopes it to auth.uid()). */
export function useAccount(accountId: string | null) {
  return useQuery({
    queryKey: ['account', accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<Account | null> => {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', accountId!)
        .maybeSingle();
      if (error) throw error;
      return data as Account | null;
    },
  });
}

/** Marks first-run onboarding done so the wizard never auto-launches again. */
export function useCompleteOnboarding(accountId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('accounts')
        .update({ onboarded: true })
        .eq('id', accountId!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['account', accountId] }),
  });
}

/**
 * Sets the account-level profile (name + avatar) and mirrors it onto all of this
 * account's household_members rows, so the person shows up the same everywhere.
 * RLS allows the member update — the caller is a member of their own households.
 */
export function useUpdateProfile(accountId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { name?: string; avatar?: string }) => {
      if (!accountId) throw new Error('Not signed in');
      const clean: Record<string, string> = {};
      if (patch.name !== undefined) clean.name = patch.name;
      if (patch.avatar !== undefined) clean.avatar = patch.avatar;
      if (Object.keys(clean).length === 0) return;
      const { error } = await supabase.from('accounts').update(clean).eq('id', accountId);
      if (error) throw error;
      const { error: mErr } = await supabase
        .from('household_members')
        .update(clean)
        .eq('account_id', accountId);
      if (mErr) throw mErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['account', accountId] });
      qc.invalidateQueries({ queryKey: ['household_members'] });
    },
  });
}

/**
 * Permanently deletes the caller's account and its data via the delete-account
 * edge function (App Store requirement). The function identifies the user from
 * their JWT; supabase-js attaches it automatically. Caller should sign out after.
 */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  if (error) throw error;
}

/**
 * Sends the household invite email via the send-invite edge function. Best-effort
 * — the member row already exists (invite_pending), so a send failure just means
 * the email didn't go out, not that the invite failed.
 */
export async function sendInvite(memberId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('send-invite', { body: { memberId } });
  if (error) throw error;
}

/** Product-update email consent (Phase 6). Opt-in only. */
export function useSetMarketingOptIn(accountId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (optIn: boolean) => {
      const { error } = await supabase
        .from('accounts')
        .update({ marketing_opt_in: optIn })
        .eq('id', accountId!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['account', accountId] }),
  });
}

// Sign-up runs before a session exists (email confirmation), so the marketing
// checkbox choice is stashed and written to the account on first authed load.
const PENDING_MARKETING_KEY = 'ourdollar.pendingMarketingOptIn';

export async function stashPendingMarketingOptIn(optIn: boolean): Promise<void> {
  await AsyncStorage.setItem(PENDING_MARKETING_KEY, optIn ? '1' : '0').catch(() => {});
}

export async function applyPendingMarketingOptIn(accountId: string): Promise<void> {
  const stored = await AsyncStorage.getItem(PENDING_MARKETING_KEY).catch(() => null);
  if (stored == null) return;
  await AsyncStorage.removeItem(PENDING_MARKETING_KEY).catch(() => {});
  // Only ever flips it on — never silently opts someone out of an existing choice.
  if (stored === '1') {
    await supabase.from('accounts').update({ marketing_opt_in: true }).eq('id', accountId);
  }
}

// ---- Household creation + invite claim (Phase 3, multi-household) ----

export type CreateHouseholdInput = {
  householdName: string;
  /** Optional emails to invite into the new household. */
  inviteEmails?: string[];
};

/**
 * Creates a household owned by the current account, seeds the creator as the
 * admin member from their ACCOUNT profile (name/avatar — no longer re-entered
 * per household), and adds an (empty) fun-money settings row. Optionally invites
 * people by email (placeholder member rows + best-effort invite email). Plain
 * inserts — existing RLS lets an owner bootstrap their own household. Returns the
 * new household id so the caller can switch to it. Best-effort cleanup if a
 * core follow-up insert fails, so we don't leave an orphan household behind.
 */
export function useCreateHousehold() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateHouseholdInput): Promise<string> => {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const accountId = userData.user?.id;
      if (!accountId) throw new Error('Not signed in');

      const { data: acct } = await supabase
        .from('accounts')
        .select('name, avatar')
        .eq('id', accountId)
        .maybeSingle();

      const { data: household, error: hErr } = await supabase
        .from('households')
        .insert({ name: input.householdName, owner_account_id: accountId })
        .select()
        .single();
      if (hErr) throw hErr;

      const { data: adminMember, error: mErr } = await supabase
        .from('household_members')
        .insert({
          household_id: household.id,
          account_id: accountId,
          name: acct?.name ?? 'Me',
          avatar: acct?.avatar ?? '🙂',
          is_admin: true,
          has_account: true,
        })
        .select()
        .single();
      if (mErr) {
        await supabase.from('households').delete().eq('id', household.id);
        throw mErr;
      }

      const { error: fErr } = await supabase
        .from('fun_money_settings')
        .insert({ household_id: household.id, enabled: false });
      if (fErr) {
        await supabase.from('households').delete().eq('id', household.id);
        throw fErr;
      }

      // Invites are best-effort — a failure here doesn't undo the household.
      const emails = (input.inviteEmails ?? []).map((e) => e.trim()).filter(Boolean);
      for (const email of emails) {
        const local = email.split('@')[0] ?? '';
        const placeholder = local ? local.charAt(0).toUpperCase() + local.slice(1) : 'Invited';
        const { data: invite } = await supabase
          .from('household_members')
          .insert({
            household_id: household.id,
            name: placeholder,
            avatar: '🙂',
            is_admin: false,
            has_account: false,
            invite_email: email,
            invite_pending: true,
            invited_by_member_id: adminMember.id,
            invited_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (invite) {
          supabase.functions.invoke('send-invite', { body: { memberId: invite.id } }).catch(() => {});
        }
      }

      return household.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['households'] }),
  });
}

/**
 * Links any household_members rows whose invite_email matches the caller's
 * account email (see the claim_pending_invites migration). Returns the number
 * of memberships claimed. Retained for reference/tests — the app now surfaces
 * invites for explicit accept/decline (see listMyPendingInvites) rather than
 * auto-claiming on login.
 */
export async function claimPendingInvites(): Promise<number> {
  const { data, error } = await supabase.rpc('claim_pending_invites');
  if (error) throw error;
  return (data as number) ?? 0;
}

// ---- Pending invites (explicit accept / decline, Phase 8) ----

export type PendingInvite = {
  member_id: string;
  household_id: string;
  household_name: string;
  inviter_name: string;
  invited_at: string | null;
};

/** Invites addressed to the signed-in user's email, awaiting their response. */
export async function listMyPendingInvites(): Promise<PendingInvite[]> {
  const { data, error } = await supabase.rpc('list_my_pending_invites');
  if (error) throw error;
  return (data as PendingInvite[]) ?? [];
}

export function usePendingInvites(userId: string | null) {
  return useQuery({
    queryKey: ['pendingInvites', userId],
    enabled: !!userId,
    queryFn: listMyPendingInvites,
  });
}

/**
 * Accept / decline one pending invite. Both re-verify the email match on the
 * server, so a caller can only act on invites addressed to them. On success we
 * refresh both the invite list and the household list (an accept adds a
 * membership that should appear immediately).
 */
export function useInviteResponses() {
  const qc = useQueryClient();
  const settle = () => {
    qc.invalidateQueries({ queryKey: ['pendingInvites'] });
    qc.invalidateQueries({ queryKey: ['households'] });
  };

  const accept = useMutation({
    mutationFn: async (memberId: string): Promise<boolean> => {
      const { data, error } = await supabase.rpc('accept_invite', { p_member_id: memberId });
      if (error) throw error;
      return (data as boolean) ?? false;
    },
    onSuccess: settle,
  });

  const decline = useMutation({
    mutationFn: async (memberId: string): Promise<boolean> => {
      const { data, error } = await supabase.rpc('decline_invite', { p_member_id: memberId });
      if (error) throw error;
      return (data as boolean) ?? false;
    },
    onSuccess: settle,
  });

  return { accept, decline };
}

// ---- Week rollover / overage settlement ----

// ---- Catch-up balance ----

/** Every movement on the catch-up balance, newest first. */
export function useCatchUpEntries(householdId: string | null) {
  return useQuery({
    queryKey: ['catchup_entries', householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<CatchUpEntry[]> => {
      const { data, error } = await supabase
        .from('catchup_entries')
        .select('*')
        .eq('household_id', householdId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CatchUpEntry[];
    },
  });
}

export type CatchUpInput = {
  amount: number; // signed, as stored
  kind: CatchUpEntry['kind'];
  note?: string | null;
  sourceWeekStart?: string | null;
  memberId?: string | null;
};

export function useCatchUpMutations(householdId: string | null) {
  const qc = useQueryClient();
  const settle = () => qc.invalidateQueries({ queryKey: ['catchup_entries', householdId] });

  const add = useMutation({
    mutationFn: async (input: CatchUpInput) => {
      const { error } = await supabase.from('catchup_entries').insert({
        household_id: householdId,
        amount: input.amount,
        kind: input.kind,
        note: input.note ?? null,
        source_week_start: input.sourceWeekStart ?? null,
        created_by_member_id: input.memberId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: settle,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('catchup_entries').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: settle,
  });

  /**
   * Pays catch-up down out of this week's allowance.
   *
   * There used to be a bare "pay some off" button here, and it was removed
   * because it dropped the balance with nothing behind it. This is the thing
   * that button should have been: the balance comes down AND an ordinary
   * expense row charges the week, which is the same real money as finishing a
   * week under budget and putting the leftover toward it. The only difference
   * is that it's committed on the day rather than discovered on Sunday.
   *
   * It also can't be used to wish the debt away. Charge the week $40 and then
   * spend the whole week anyway, and the week finishes $40 over — which the
   * rollover prompt offers to send straight back to catch-up. The debt
   * survives everything except actually going without.
   *
   * Both halves in one mutation so a failure is reported once, rather than
   * leaving the household to guess which half landed.
   */
  const payFromWeek = useMutation({
    mutationFn: async (args: {
      amount: number;
      owed: number;
      occurredOn: string;
      memberId: string | null;
    }) => {
      // Never more than is owed. Paying past zero would leave a credit that
      // reads as the household being owed money by itself, and the balance
      // floors at zero anyway, so the excess would simply vanish.
      const amount = Math.round(Math.min(Math.abs(args.amount), args.owed) * 100) / 100;
      if (amount <= 0) return;

      const { error } = await supabase.from('catchup_entries').insert({
        household_id: householdId,
        amount: -amount,
        kind: 'payment',
        note: 'From this week',
        created_by_member_id: args.memberId,
      });
      if (error) throw error;

      const { error: tErr } = await supabase.from('transactions').insert({
        household_id: householdId,
        member_id: args.memberId,
        amount,
        // No category, the same as a deposit into the emergency fund. Making
        // up lost ground isn't spending on anything, and filing it under a
        // category would put it in the "where did the week go" breakdown as
        // though the household had bought something with it.
        category: null,
        label: 'Toward catch-up',
        type: 'expense',
        is_fun_money: false,
        // Charges the week, but never counts as spending on anything.
        transfer: true,
        occurred_on: args.occurredOn,
      });
      if (tErr) throw tErr;
    },
    onSuccess: () => {
      settle();
      qc.invalidateQueries({ queryKey: ['transactions', householdId] });
    },
  });

  return { add, remove, payFromWeek };
}

/**
 * What one bill has cost in each closed month, newest first.
 *
 * Scoped to a single bill and only fetched while its sheet is open, because a
 * household with 31 bills and a year of history has ~370 of these and none of
 * them are needed until someone asks about one bill.
 */
export function useBillHistory(householdId: string | null, billId: string | null) {
  return useQuery({
    queryKey: ['bill_month_lines', householdId, billId],
    enabled: !!householdId && !!billId,
    queryFn: async (): Promise<BillMonthLine[]> => {
      const { data, error } = await supabase
        .from('bill_month_lines')
        .select('*')
        .eq('household_id', householdId!)
        .eq('bill_id', billId!)
        .order('month', { ascending: false });
      if (error) throw error;
      return (data ?? []) as BillMonthLine[];
    },
  });
}

// ---- Emergency fund ----

/** Every movement on the emergency fund, newest first. */
export function useEmergencyFund(householdId: string | null) {
  return useQuery({
    queryKey: ['emergency_fund_entries', householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<EmergencyFundEntry[]> => {
      const { data, error } = await supabase
        .from('emergency_fund_entries')
        .select('*')
        .eq('household_id', householdId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as EmergencyFundEntry[];
    },
  });
}

/**
 * The fund's target and monthly amount, or null until one is set.
 *
 * maybeSingle rather than single: a household that has never opened the fund
 * has no row, and that's the normal state, not a failure. Every caller reads
 * `?? 0` off both figures, which is also what keeps the budget correct for
 * every household that existed before the fund had a target at all.
 */
export function useEmergencyFundSettings(householdId: string | null) {
  return useQuery({
    queryKey: ['emergency_fund_settings', householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<EmergencyFundSettings | null> => {
      const { data, error } = await supabase
        .from('emergency_fund_settings')
        .select('*')
        .eq('household_id', householdId!)
        .maybeSingle();
      if (error) throw error;
      return data as EmergencyFundSettings | null;
    },
  });
}

export function useEmergencyFundMutations(householdId: string | null) {
  const qc = useQueryClient();
  const settleFund = () => {
    qc.invalidateQueries({ queryKey: ['emergency_fund_entries', householdId] });
    qc.invalidateQueries({ queryKey: ['transactions', householdId] });
  };

  /**
   * Takes money out, and puts it into the week it was taken in.
   *
   * Both halves matter. The fund goes down, and an ordinary income row raises
   * this week, which is what makes an emergency cost nothing from the weekly
   * budget: $500 out and a $500 repair logged against the week cancel exactly.
   * Without the second half the repair would eat a week that never had the
   * money in it.
   */
  const withdraw = useMutation({
    mutationFn: async (args: {
      amount: number;
      balance: number;
      note: string;
      occurredOn: string;
      memberId: string | null;
    }) => {
      // Never more than is in there: the balance floors at zero anyway, so an
      // over-withdrawal would silently hand out money the fund never held.
      const amount = Math.round(Math.min(Math.abs(args.amount), args.balance) * 100) / 100;
      if (amount <= 0) return;

      const { error } = await supabase.from('emergency_fund_entries').insert({
        household_id: householdId,
        amount: -amount,
        kind: 'withdrawal',
        note: args.note || 'Taken out',
        created_by_member_id: args.memberId,
      });
      if (error) throw error;

      const { error: tErr } = await supabase.from('transactions').insert({
        household_id: householdId,
        member_id: args.memberId,
        amount,
        category: null,
        label: args.note || 'From emergency fund',
        type: 'income',
        is_fun_money: false,
        income_destination: 'this_week',
        occurred_on: args.occurredOn,
      });
      if (tErr) throw tErr;
    },
    onSuccess: settleFund,
  });

  /**
   * Puts money in by hand, out of the week it's put in.
   *
   * The exact mirror of withdraw(), for the same reason: money can't appear in
   * the fund from nowhere. This week has already been handed its allowance, so
   * moving some of it into the fund has to cost the week that much, which an
   * ordinary expense row does.
   *
   * No cap on the amount. A household is allowed to decide the fund matters
   * more than the rest of their week, and a week that ends short is a state
   * the app already explains at the rollover prompt rather than one to
   * prevent here.
   *
   * Deliberately NOT the same thing as contributeMonthly() below: that money
   * was held back from the plan before the week was divided, so charging a
   * week for it would take it twice.
   */
  const deposit = useMutation({
    mutationFn: async (args: {
      amount: number;
      note: string;
      occurredOn: string;
      memberId: string | null;
    }) => {
      const amount = Math.round(Math.abs(args.amount) * 100) / 100;
      if (amount <= 0) return;

      const { error } = await supabase.from('emergency_fund_entries').insert({
        household_id: householdId,
        amount,
        kind: 'deposit',
        note: args.note || 'Put in',
        created_by_member_id: args.memberId,
      });
      if (error) throw error;

      const { error: tErr } = await supabase.from('transactions').insert({
        household_id: householdId,
        member_id: args.memberId,
        amount,
        // No category on purpose. It isn't spending on anything, and giving it
        // one would file savings inside the "where did the week go" breakdown
        // as though the household had bought something with it.
        category: null,
        // Constant, not derived from the note: this is the ledger row's title
        // and the phrase the spend-alert push reads out, so it has to name the
        // destination in both places regardless of what the note says.
        label: 'To the emergency fund',
        type: 'expense',
        is_fun_money: false,
        // Charges the week, but never counts as spending on anything.
        transfer: true,
        occurred_on: args.occurredOn,
      });
      if (tErr) throw tErr;
    },
    onSuccess: settleFund,
  });

  /**
   * Records the month's planned amount.
   *
   * No transaction, on purpose. computeBudget() already held this back before
   * dividing the weekly allowance, so the week never had the money; charging a
   * week for it would take the same amount twice. This is the same rule "Mark
   * paid" follows on a savings goal, which only moves saved_amount.
   *
   * A duplicate is a no-op rather than an error: the unique index means two
   * devices tapping at once can't double-count, and the second one has nothing
   * to report.
   */
  const contributeMonthly = useMutation({
    mutationFn: async (args: { amount: number; monthKey: string; memberId: string | null }) => {
      const amount = Math.round(Math.abs(args.amount) * 100) / 100;
      if (amount <= 0) return;

      const { error } = await supabase.from('emergency_fund_entries').insert({
        household_id: householdId,
        amount,
        kind: 'monthly',
        month_key: args.monthKey,
        note: "This month's amount",
        created_by_member_id: args.memberId,
      });
      // 23505 is a unique violation — this month's amount is already in.
      if (error && error.code !== '23505') throw error;
    },
    onSuccess: settleFund,
  });

  /** Sets the target and the monthly amount. Upsert: the row may not exist. */
  const saveSettings = useMutation({
    mutationFn: async (args: { targetAmount: number; monthlyAmount: number }) => {
      const { error } = await supabase.from('emergency_fund_settings').upsert(
        {
          household_id: householdId,
          target_amount: Math.max(0, Math.round(args.targetAmount * 100) / 100),
          monthly_amount: Math.max(0, Math.round(args.monthlyAmount * 100) / 100),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'household_id' }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emergency_fund_settings', householdId] });
    },
  });

  return { withdraw, deposit, contributeMonthly, saveSettings };
}

// ---- Week results (what a week was actually worth) ----

/**
 * The recorded weekly allowance for a week, or null if none was recorded.
 *
 * Null means the household didn't open the app during that week, so there's no
 * historical figure and callers have to fall back to recomputing. Callers
 * should say so on screen rather than presenting an estimate as fact.
 */
export function useWeekResult(householdId: string | null, weekStart: string | null) {
  return useQuery({
    queryKey: ['week_results', householdId, weekStart],
    enabled: !!householdId && !!weekStart,
    queryFn: async (): Promise<number | null> => {
      const { data, error } = await supabase
        .from('week_results')
        .select('weekly_allowance')
        .eq('household_id', householdId!)
        .eq('week_start', weekStart!)
        .maybeSingle();
      if (error) throw error;
      return data ? Number(data.weekly_allowance) : null;
    },
  });
}

/**
 * Writes down what THIS week is worth, so it can never be restated later.
 *
 * Called while the week is still running, so the stored figure tracks changes
 * (a bill landing, a pay rise) right up to the moment the week ends. After
 * that nothing writes to it again.
 */
export function useRecordWeekResult(householdId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    // Bookkeeping the household never asked for, so a failure must not raise a
    // toast: "Couldn't save your change" about a write they didn't make is
    // alarming and unactionable. It simply records again next time the Week
    // screen opens.
    meta: { silent: true },
    mutationFn: async ({ weekStart, weeklyAllowance }: { weekStart: string; weeklyAllowance: number }) => {
      const { error } = await supabase
        .from('week_results')
        .upsert(
          { household_id: householdId, week_start: weekStart, weekly_allowance: weeklyAllowance, recorded_at: new Date().toISOString() },
          { onConflict: 'household_id,week_start' }
        );
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['week_results', householdId, vars.weekStart] });
    },
  });
}

/** Total already carried into a given week from prior settlements (0 if none). */
export function useWeekAdjustment(householdId: string | null, weekStart: string | null) {
  return useQuery({
    queryKey: ['week_rollovers', 'adjustment', householdId, weekStart],
    enabled: !!householdId && !!weekStart,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from('week_rollovers')
        .select('applied_amount')
        .eq('household_id', householdId!)
        .eq('to_week_start', weekStart!);
      if (error) throw error;
      return (data ?? []).reduce((a, r) => a + Number(r.applied_amount), 0);
    },
  });
}

/** Whether the week that ended on `fromWeekStart` has already been settled. */
export function useRolloverSettled(householdId: string | null, fromWeekStart: string | null) {
  return useQuery({
    queryKey: ['week_rollovers', 'settled', householdId, fromWeekStart],
    enabled: !!householdId && !!fromWeekStart,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('week_rollovers')
        .select('id')
        .eq('household_id', householdId!)
        .eq('from_week_start', fromWeekStart!)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });
}

export type RolloverResolution = 'carry_forward' | 'goal' | 'dismiss' | 'catch_up';

export type SettleRolloverInput = {
  fromWeekStart: string;
  toWeekStart: string;
  amount: number; // signed: + leftover, − overage
  resolution: RolloverResolution;
  goalId?: string;
  goalSavedAmount?: number;
  goalTargetAmount?: number;
  settledByMemberId?: string | null;
};

/** Records how a just-ended week's leftover/overage was resolved (once per week). */
export function useSettleRollover(householdId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SettleRolloverInput) => {
      const applied = input.resolution === 'carry_forward' ? input.amount : 0;
      const { error } = await supabase.from('week_rollovers').insert({
        household_id: householdId,
        from_week_start: input.fromWeekStart,
        to_week_start: input.toWeekStart,
        amount: input.amount,
        resolution: input.resolution,
        applied_amount: applied,
        goal_id: input.resolution === 'goal' ? (input.goalId ?? null) : null,
        settled_by_member_id: input.settledByMemberId ?? null,
      });
      if (error) throw error;

      if (input.resolution === 'goal' && input.goalId && input.goalSavedAmount != null) {
        const cap = input.goalTargetAmount ?? Infinity;
        const next = Math.max(0, Math.min(cap, input.goalSavedAmount + input.amount));
        const { error: gErr } = await supabase.from('goals').update({ saved_amount: next }).eq('id', input.goalId);
        if (gErr) throw gErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['week_rollovers'] });
      qc.invalidateQueries({ queryKey: ['goals', householdId] });
    },
  });
}

// ---- Household + member mutations (Profile) ----

/** Updates a household's name and/or accent color by id (owner-only at DB level). */
export function useUpdateHousehold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, color }: { id: string; name?: string; color?: string }) => {
      const patch: Record<string, string> = {};
      if (name !== undefined) patch.name = name;
      if (color !== undefined) patch.color = color;
      if (Object.keys(patch).length === 0) return;
      const { error } = await supabase.from('households').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['households'] }),
  });
}

export function useHouseholdMutations(householdId: string | null) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['households'] });

  const rename = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('households').update({ name }).eq('id', householdId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const setWeekStart = useMutation({
    mutationFn: async (week_start_day: number) => {
      const { error } = await supabase
        .from('households')
        .update({ week_start_day })
        .eq('id', householdId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { rename, setWeekStart };
}

export type NewMemberInput = {
  name: string;
  funMonthly: number;
  inviteEmail: string | null;
  /** True when the adder isn't an owner/admin — the add waits for approval. */
  approvalPending?: boolean;
};

/**
 * Owner/admin actions on members, all via SECURITY DEFINER RPCs that re-check the
 * caller's role server-side (see the household_roles migration).
 */
export function useMemberRoleActions(householdId: string | null) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['household_members'] });
    qc.invalidateQueries({ queryKey: ['households'] });
  };

  const approve = useMutation({
    mutationFn: async (memberId: string) => {
      const { data, error } = await supabase.rpc('approve_member', { p_member_id: memberId });
      if (error) throw error;
      // A non-null email means there's a pending invite to send now that it's approved.
      if (data) {
        await supabase.functions.invoke('send-invite', { body: { memberId } }).catch(() => {});
      }
    },
    onSuccess: invalidate,
  });

  const setAdmin = useMutation({
    mutationFn: async ({ memberId, isAdmin }: { memberId: string; isAdmin: boolean }) => {
      const { error } = await supabase.rpc('set_member_admin', {
        p_member_id: memberId,
        p_is_admin: isAdmin,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const transfer = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.rpc('transfer_ownership', { p_member_id: memberId });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { approve, setAdmin, transfer };
}

export function useMemberMutations(householdId: string | null) {
  const qc = useQueryClient();
  const invalidate = () => {
    // Prefix key so both the active-household and all-households member queries refresh.
    qc.invalidateQueries({ queryKey: ['household_members'] });
    qc.invalidateQueries({ queryKey: ['fun_money_people', householdId] });
  };

  const update = useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: {
      id: string;
      name?: string;
      avatar?: string;
      notify_on_spend?: boolean;
    }) => {
      const { error } = await supabase.from('household_members').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const add = useMutation({
    mutationFn: async (input: NewMemberInput): Promise<string> => {
      // Look up the adder's own member row — recorded as inviter/adder so the
      // invitee's prompt and the approval queue can name them.
      let callerMemberId: string | null = null;
      const { data: userData } = await supabase.auth.getUser();
      const accountId = userData.user?.id;
      if (accountId) {
        const { data: me } = await supabase
          .from('household_members')
          .select('id')
          .eq('household_id', householdId!)
          .eq('account_id', accountId)
          .maybeSingle();
        callerMemberId = me?.id ?? null;
      }

      const { data, error } = await supabase
        .from('household_members')
        .insert({
          household_id: householdId,
          name: input.name,
          avatar: '🙂',
          is_admin: false,
          has_account: false,
          invite_email: input.inviteEmail,
          invite_pending: !!input.inviteEmail,
          invited_by_member_id: input.inviteEmail ? callerMemberId : null,
          invited_at: input.inviteEmail ? new Date().toISOString() : null,
          approval_pending: input.approvalPending ?? false,
          added_by_member_id: callerMemberId,
        })
        .select()
        .single();
      if (error) throw error;
      // Only give them a fun-money allotment when the toggle was on.
      if (input.funMonthly > 0) {
        const { error: funError } = await supabase.from('fun_money_people').insert({
          household_id: householdId,
          member_id: data.id,
          monthly_amount: input.funMonthly,
        });
        if (funError) throw funError;
      }
      return data.id as string;
    },
    onSuccess: invalidate,
  });

  // fun_money_people.member_id cascades on delete, so removing the member
  // removes their fun-money row automatically.
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('household_members').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { update, add, remove };
}
