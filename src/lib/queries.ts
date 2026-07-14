import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type {
  Bill,
  ExtraIncome,
  FunMoneyPerson,
  FunMoneySettings,
  Goal,
  HouseholdMember,
  IncomeSource,
  Transaction,
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

  return { create, update, remove };
}

// ---- Household creation + invite claim (Phase 3, multi-household) ----

export type CreateHouseholdInput = {
  householdName: string;
  memberName: string;
  avatar?: string;
};

/**
 * Creates a household owned by the current account, seeds the creator as the
 * admin member, and adds an (empty) fun-money settings row. Done with plain
 * inserts — existing RLS lets an owner bootstrap their own household. Returns
 * the new household id so the caller can switch to it. Best-effort cleanup if a
 * follow-up insert fails, so we don't leave an orphan household behind.
 */
export function useCreateHousehold() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateHouseholdInput): Promise<string> => {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const accountId = userData.user?.id;
      if (!accountId) throw new Error('Not signed in');

      const { data: household, error: hErr } = await supabase
        .from('households')
        .insert({ name: input.householdName, owner_account_id: accountId })
        .select()
        .single();
      if (hErr) throw hErr;

      const { error: mErr } = await supabase.from('household_members').insert({
        household_id: household.id,
        account_id: accountId,
        name: input.memberName,
        avatar: input.avatar ?? '🙂',
        is_admin: true,
        has_account: true,
      });
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

      return household.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['households'] }),
  });
}

/**
 * Links any household_members rows whose invite_email matches the caller's
 * account email (see the claim_pending_invites migration). Returns the number
 * of memberships claimed. Safe to call on every login.
 */
export async function claimPendingInvites(): Promise<number> {
  const { data, error } = await supabase.rpc('claim_pending_invites');
  if (error) throw error;
  return (data as number) ?? 0;
}

// ---- Household + member mutations (Profile) ----

export function useHouseholdMutations(householdId: string | null) {
  const qc = useQueryClient();

  const rename = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('households').update({ name }).eq('id', householdId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['households'] }),
  });

  return { rename };
}

export type NewMemberInput = {
  name: string;
  funMonthly: number;
  inviteEmail: string | null;
};

export function useMemberMutations(householdId: string | null) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['household_members', householdId] });
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
    mutationFn: async (input: NewMemberInput) => {
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
        })
        .select()
        .single();
      if (error) throw error;
      // Give the new member a fun-money allotment too.
      const { error: funError } = await supabase.from('fun_money_people').insert({
        household_id: householdId,
        member_id: data.id,
        monthly_amount: input.funMonthly,
      });
      if (funError) throw funError;
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
