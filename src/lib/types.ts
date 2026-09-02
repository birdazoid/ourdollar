// Row shapes for the Supabase tables (design-brief §9). Only the columns the
// app reads/writes are typed; timestamps etc. are optional where unused.

/** Where arriving money goes. Only 'this_week' raises the week's spending. */
export type IncomeDestination =
  | 'this_week'
  | 'catch_up'
  | 'goal'
  | 'month'
  | 'emergency_fund';

export type Frequency = 'monthly' | 'semimonthly' | 'biweekly' | 'weekly';

export type Account = {
  id: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  subscription_status: string;
  subscription_tier: string;
  // Entitlement columns; see src/lib/limits.ts for how these resolve to a tier.
  plan_source: string | null;
  plan_expires_at: string | null;
  founding_user: boolean;
  onboarded: boolean;
  marketing_opt_in: boolean;
  created_at: string;
};

export type Household = {
  id: string;
  name: string;
  owner_account_id: string;
  week_start_day: number; // 0 = Sunday … 6 = Saturday
  color: string | null; // household-color palette key; null = id-hash default
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
  approval_pending: boolean;
  added_by_member_id: string | null;
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

/**
 * One movement on the catch-up balance. Signed: positive adds to what's owed,
 * negative pays it down. The balance is the sum of these and is never stored
 * anywhere, so it can't drift from its own history.
 */
export type CatchUpEntry = {
  id: string;
  household_id: string;
  amount: number;
  kind: 'week_overage' | 'payment' | 'adjustment';
  note: string | null;
  source_week_start: string | null;
  created_by_member_id: string | null;
  created_at: string;
};

/**
 * One movement on the emergency fund. Signed: positive puts money in, negative
 * takes it out. Like the catch-up balance, the total is summed from these
 * rather than stored, so it can't drift from its own history.
 */
export type EmergencyFundEntry = {
  id: string;
  household_id: string;
  amount: number;
  /**
   * 'monthly' is the planned contribution, already held back from the weekly
   * allowance before the week was divided. It's kept apart from 'deposit' —
   * money moved in by hand out of a week that had already been given it —
   * because only the second one costs the household a week's spending.
   */
  kind: 'deposit' | 'withdrawal' | 'adjustment' | 'monthly';
  /** 'YYYY-MM' on a 'monthly' entry, null on every other kind. */
  month_key: string | null;
  note: string | null;
  created_by_member_id: string | null;
  created_at: string;
};

/**
 * The fund's target and monthly amount. Absent until a household sets one, so
 * every reader treats a missing row as zeros rather than as an error.
 */
export type EmergencyFundSettings = {
  household_id: string;
  /** What they're aiming for. 0 = no target set. Never a ceiling. */
  target_amount: number;
  /** Held back from the plan each month, like a goal's monthly amount. */
  monthly_amount: number;
  updated_at: string;
};

// A closed month's full budget plan + bill outcome — the only durable record of
// "what the plan was" for a past month, since bills reset and computeBudget()
// only ever reflects today's live settings. bills_paid_amount/count can be
// credited retroactively (see resolve_carryover) when a carried-over bill from
// this month finally gets paid, however much later that happens.
export type MonthSnapshot = {
  id: string;
  household_id: string;
  month: string; // YYYY-MM-01, the closed month
  total_income: number;
  total_fixed: number;
  goals_monthly: number;
  goals_saved_total: number; // point-in-time sum of goals.saved_amount at close
  fun_total: number;
  emergency_monthly: number; // the fund's monthly amount as it stood at close
  weekly_allowance: number;
  bills_paid_amount: number;
  bills_total_amount: number;
  bills_paid_count: number;
  bills_total_count: number;
  created_at: string;
};

/**
 * What one bill cost in one closed month.
 *
 * Written by close_month, at the only moment it can be: bills reset every
 * month, so after the close the per-bill outcome exists nowhere else. Name and
 * category are COPIED rather than joined, so renaming a bill doesn't rewrite
 * what last March's record says it was called.
 *
 * `bill_id` goes null if the bill is later deleted — the history of what a
 * household paid stays true even once they stop paying it.
 */
export type BillMonthLine = {
  id: string;
  household_id: string;
  month: string; // 'YYYY-MM-01', the month that closed
  bill_id: string | null;
  name: string;
  category: string;
  /** What it was budgeted at. Null for a `varies` bill, which has no estimate. */
  estimate: number | null;
  /** What it actually cost — the paid figure where known, else the estimate. */
  actual: number | null;
  paid: boolean;
  created_at: string;
};

// A bill still unpaid when its month closed, carried forward as its own
// reminder — separate from the bill's fresh (reset) new-month cycle.
export type BillCarryover = {
  id: string;
  household_id: string;
  bill_id: string | null;
  name: string;
  category: string;
  amount: number | null;
  from_month: string; // YYYY-MM-01
  resolved: boolean;
  resolved_amount: number | null;
  resolved_by_member_id: string | null;
  resolved_on: string | null;
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
  /**
   * For income only: where the money was assigned. Null means 'this_week',
   * which is how every row behaved before destinations existed.
   */
  income_destination: IncomeDestination | null;
  /**
   * True for an expense that moved money rather than spent it: into the
   * emergency fund, or onto the catch-up balance. It still reduces the week,
   * but it is not spending on anything, so the category breakdown and the
   * monthly trend leave it out. See isWeekExpense / isVariableExpense.
   */
  transfer: boolean;
  occurred_on: string;
  created_at: string;
};
