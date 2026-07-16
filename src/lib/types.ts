// Row shapes for the Supabase tables (design-brief §9). Only the columns the
// app reads/writes are typed; timestamps etc. are optional where unused.

export type Frequency = 'monthly' | 'semimonthly';

export type Account = {
  id: string;
  email: string | null;
  subscription_status: string;
  subscription_tier: string;
  onboarded: boolean;
  marketing_opt_in: boolean;
  created_at: string;
};

export type Household = {
  id: string;
  name: string;
  owner_account_id: string;
  week_start_day: number; // 0 = Sunday … 6 = Saturday
  created_at: string;
};

export type HouseholdMember = {
  id: string;
  household_id: string;
  account_id: string | null;
  name: string;
  avatar: string | null;
  is_admin: boolean;
  has_account: boolean;
  invite_email: string | null;
  invite_pending: boolean;
  invited_by_member_id: string | null;
  invited_at: string | null;
  notify_on_spend: boolean;
  created_at: string;
};

export type IncomeSource = {
  id: string;
  household_id: string;
  member_id: string | null;
  amount: number;
  frequency: Frequency;
  created_at: string;
};

export type ExtraIncome = {
  id: string;
  household_id: string;
  member_id: string | null;
  source: string;
  amount: number;
  occurred_on: string;
  created_at: string;
};

export type Bill = {
  id: string;
  household_id: string;
  name: string;
  amount: number | null;
  category: string;
  due_day: number | null;
  due_label: string | null;
  varies: boolean;
  paid: boolean;
  paid_amount: number | null;
  paid_by_member_id: string | null;
  paid_on: string | null;
  created_at: string;
};

export type Goal = {
  id: string;
  household_id: string;
  name: string;
  emoji: string | null;
  target_amount: number;
  monthly_amount: number;
  saved_amount: number;
  paid_this_month: boolean;
  created_at: string;
};

export type FunMoneySettings = {
  household_id: string;
  enabled: boolean;
};

export type FunMoneyPerson = {
  id: string;
  household_id: string;
  member_id: string | null;
  monthly_amount: number;
};

// A weekly "envelope" = a transaction category given a weekly budget. Drains
// from logged non-fun expenses in that category. `skipped_week_start` marks the
// envelope as skipped for the week whose start date it equals (self-resetting).
export type WeeklyEnvelope = {
  id: string;
  household_id: string;
  category: string;
  weekly_amount: number;
  skipped_week_start: string | null;
  created_at: string;
};

export type Transaction = {
  id: string;
  household_id: string;
  member_id: string | null;
  amount: number;
  category: string | null;
  label: string | null;
  type: 'expense' | 'income';
  is_fun_money: boolean;
  occurred_on: string;
  created_at: string;
};
