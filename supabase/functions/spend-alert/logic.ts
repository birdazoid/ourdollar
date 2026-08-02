// Pure logic for the spend-alert push, with no Deno/Supabase dependencies so it
// can be imported by both the edge function (Deno) and the Node verification
// script (scripts/verify-spend-alert.ts). DB access lives in the callers.

export const FREQ_MULT: Record<string, number> = { monthly: 1, semimonthly: 2 };

// Mirror of TX_CATEGORIES id → display name (src/lib/categories.ts).
export const CATEGORY_NAME: Record<string, string> = {
  groceries: 'Groceries',
  fuel: 'Fuel',
  dining: 'Dining',
  household: 'Household',
  kids: 'Kids',
  pets: 'Pets',
  personal: 'Personal',
  entertainment: 'Entertainment',
  other: 'Other',
};

export function fmt(n: number): string {
  const hasCents = n % 1 !== 0;
  return (
    '$' +
    Number(n).toLocaleString('en-US', {
      maximumFractionDigits: hasCents ? 2 : 0,
      minimumFractionDigits: hasCents ? 2 : 0,
    })
  );
}

/**
 * Week bounds containing today, as YYYY-MM-DD (UTC), starting on `weekStartDay`
 * (0 = Sunday … 6 = Saturday — matches households.week_start_day). Defaults to
 * Sunday for callers that don't have a household's setting on hand.
 */
export function currentWeekBounds(weekStartDay = 0, now = new Date()) {
  const base = new Date(now);
  base.setUTCHours(0, 0, 0, 0);
  const sinceStart = (base.getUTCDay() - weekStartDay + 7) % 7;
  const start = new Date(base);
  start.setUTCDate(base.getUTCDate() - sinceStart);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

export type BudgetRows = {
  income: { amount: number; frequency: string }[];
  extra: { amount: number }[];
  bills: { paid: boolean; paid_amount: number | null; amount: number | null }[];
  goals: { monthly_amount: number }[];
  funEnabled: boolean;
  funPeople: { monthly_amount: number }[];
};

// ---- Budget periods (mirrors src/lib/period.ts) ----
//
// A month's pool is split across the WHOLE WEEKS assigned to it, not a fixed 4.
// The period for month M starts on the first week-start day on or after the 1st
// and runs to the day before M+1's period, so every period is 4 or 5 whole
// weeks and no week is ever split across two months.

const MS_PER_WEEK = 7 * 86400000;

/** First day of a month's period, as YYYY-MM-DD (UTC). */
export function periodStart(year: number, monthIndex: number, weekStartDay: number): Date {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const forward = (weekStartDay - first.getUTCDay() + 7) % 7;
  const start = new Date(first);
  start.setUTCDate(1 + forward);
  return start;
}

/** Whole weeks a month's pool is split across. Always 4 or 5. */
export function weeksInPeriod(year: number, monthIndex: number, weekStartDay: number): number {
  const a = periodStart(year, monthIndex, weekStartDay);
  const b = periodStart(year, monthIndex + 1, weekStartDay);
  return Math.round((b.getTime() - a.getTime()) / MS_PER_WEEK);
}

/**
 * The period funding "now", and how many of its weeks are left counting the
 * current one. A week belongs to the month its START date falls in, which is
 * what keeps a boundary-spanning week from being funded twice.
 */
export function currentPeriod(weekStartDay: number, now = new Date()) {
  const base = new Date(now);
  base.setUTCHours(0, 0, 0, 0);
  const back = (base.getUTCDay() - weekStartDay + 7) % 7;
  const weekStart = new Date(base);
  weekStart.setUTCDate(base.getUTCDate() - back);

  const year = weekStart.getUTCFullYear();
  const monthIndex = weekStart.getUTCMonth();
  const nextStart = periodStart(year, monthIndex + 1, weekStartDay);
  const weeksRemaining = Math.max(
    1,
    Math.round((nextStart.getTime() - weekStart.getTime()) / MS_PER_WEEK)
  );
  return { weeks: weeksInPeriod(year, monthIndex, weekStartDay), weeksRemaining };
}

/**
 * The PLANNED weekly allowance, derived from bill estimates and split across
 * the period's real week count. Mirrors src/lib/money.ts's
 * computeBudget(...).weeklyAllowance. Bills that came in different from their
 * estimate are applied separately, in adjustedWeeklyAllowance(), so the figure
 * doesn't shift retroactively.
 */
export function weeklyAllowanceFrom(r: BudgetRows, weeksInPeriod: number): number {
  const totalIncome =
    r.income.reduce((a, s) => a + Number(s.amount) * (FREQ_MULT[s.frequency] ?? 1), 0) +
    r.extra.reduce((a, x) => a + Number(x.amount), 0);
  const plannedFixed = r.bills.reduce((a, b) => a + Number(b.amount ?? 0), 0);
  const goalsMonthly = r.goals.reduce((a, g) => a + Number(g.monthly_amount), 0);
  const funTotal = r.funEnabled ? r.funPeople.reduce((a, p) => a + Number(p.monthly_amount), 0) : 0;
  const plannedForWeeks = Math.max(0, totalIncome - plannedFixed - goalsMonthly - funTotal);
  return Math.round((plannedForWeeks / Math.max(1, weeksInPeriod)) * 100) / 100;
}

/** Σ(actual − estimate) over paid bills — mirrors computeBudget's billVariance. */
export function billVarianceFrom(r: Pick<BudgetRows, 'bills'>): number {
  const totalFixed = r.bills.reduce(
    (a, b) => a + (b.paid ? Number(b.paid_amount ?? b.amount ?? 0) : Number(b.amount ?? 0)),
    0
  );
  const plannedFixed = r.bills.reduce((a, b) => a + Number(b.amount ?? 0), 0);
  return Math.round((totalFixed - plannedFixed) * 100) / 100;
}

/** Mirrors src/lib/money.ts's adjustedWeeklyAllowance(). */
export function adjustedWeeklyAllowance(args: {
  plannedWeekly: number;
  billVariance: number;
  weeksRemaining: number;
}): number {
  const { plannedWeekly, billVariance, weeksRemaining } = args;
  if (billVariance === 0 || weeksRemaining <= 0) return plannedWeekly;
  return Math.round((plannedWeekly - billVariance / weeksRemaining) * 100) / 100;
}

export type EnvelopeInput = { category: string; weekly_amount: number; skipped: boolean };

/**
 * The household's actual free-to-spend for the week — mirrors
 * src/lib/money.ts's computeEnvelopes(...).freeToSpend exactly (planned
 * category budgets are reserved out of the allowance, not just raw spend
 * subtracted), so the push notification always agrees with what the app shows.
 * With no envelopes this reduces to the same plain "allowance − spent + income
 * back" math it replaces — the envelope terms all zero out.
 */
export function weekFreeToSpend(args: {
  weeklyAllowance: number;
  weekTxns: { amount: number; type: string; is_fun_money: boolean; category: string | null }[];
  envelopes: EnvelopeInput[];
}): number {
  const { weeklyAllowance, weekTxns, envelopes } = args;
  const expenses = weekTxns.filter((t) => t.type === 'expense' && !t.is_fun_money);
  const totalNonFunExpense = expenses.reduce((a, t) => a + Number(t.amount), 0);
  const incomeBack = weekTxns.filter((t) => t.type === 'income').reduce((a, t) => a + Number(t.amount), 0);

  const spentByCategory: Record<string, number> = {};
  for (const t of expenses) {
    const key = t.category ?? 'other';
    spentByCategory[key] = (spentByCategory[key] ?? 0) + Number(t.amount);
  }

  const effAllowance = weeklyAllowance + incomeBack;
  let plannedTotal = 0;
  let overageTotal = 0;
  let activeEnvelopeSpent = 0;
  for (const e of envelopes) {
    if (e.skipped) continue;
    const spent = spentByCategory[e.category] ?? 0;
    plannedTotal += Number(e.weekly_amount);
    overageTotal += Math.max(spent - Number(e.weekly_amount), 0);
    activeEnvelopeSpent += spent;
  }
  const otherSpent = totalNonFunExpense - activeEnvelopeSpent;

  return Math.round((effAllowance - plannedTotal - otherSpent - overageTotal) * 100) / 100;
}

export function buildSpendAlertBody(args: {
  spenderName: string;
  amount: number;
  category: string | null;
  remaining: number;
}): string {
  const categoryName = CATEGORY_NAME[args.category ?? 'other'] ?? 'spending';
  const balanceText =
    args.remaining < 0 ? `${fmt(-args.remaining)} over budget` : `${fmt(args.remaining)} left this week`;
  return `${args.spenderName} spent ${fmt(Number(args.amount))} on ${categoryName} — ${balanceText}`;
}
