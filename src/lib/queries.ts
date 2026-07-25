import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type {
  Account,
  Bill,
  ExtraIncome,
  FunMoneyPerson,
  FunMoneySettings,
  Goal,
  HouseholdMember,
  IncomeSource,
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
