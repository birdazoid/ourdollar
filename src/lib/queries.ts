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
