// Finance math, ported from family-budget-prototype.jsx. The weekly allowance is
// always derived, never set directly (design-brief §2):
//   (income − fixed bills − savings goals − fun money) ÷ 4
import type { Bill, ExtraIncome, Frequency, FunMoneyPerson, Goal, IncomeSource } from '@/lib/types';

/**
 * Monthly-equivalent multipliers.
 *
 * Every two weeks is NOT twice a month: 26 paychecks a year against 24. Paid
 * $1,000 biweekly is $2,166.67 a month, and treating it as semimonthly
 * understates income by 8.3%, about one paycheck a year. Weekly is 52/12,
 * likewise not 4.
 */
export const FREQ: Record<Frequency, { label: string; mult: number }> = {
  monthly: { label: 'Monthly', mult: 1 },
  semimonthly: { label: 'Twice a month', mult: 2 },
  biweekly: { label: 'Every 2 weeks', mult: 26 / 12 },
  weekly: { label: 'Weekly', mult: 52 / 12 },
};

/** Monthly-equivalent of a recurring income source. */
export function monthlyEquiv(src: Pick<IncomeSource, 'amount' | 'frequency'>): number {
  return src.amount * FREQ[src.frequency].mult;
}

/** "$1,234" or "$12.50" — cents only when non-integer. Null → em dash. */
export function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  const hasCents = n % 1 !== 0;
  return (
    '$' +
    Number(n).toLocaleString('en-US', {
      maximumFractionDigits: hasCents ? 2 : 0,
      minimumFractionDigits: hasCents ? 2 : 0,
    })
  );
}

/** What a bill actually costs this month: the real figure once paid, the
 *  estimate until then. */
export function billMonthlyCost(bill: Pick<Bill, 'paid' | 'paid_amount' | 'amount'>): number {
  return bill.paid ? bill.paid_amount ?? bill.amount ?? 0 : bill.amount ?? 0;
}

/** What the bill was budgeted at when the month was planned — always the
 *  estimate, even after it's been paid for more or less. */
export function billPlannedCost(bill: Pick<Bill, 'amount'>): number {
  return bill.amount ?? 0;
}

/**
 * The spendable allowance for the current week once bills have come in
 * different from their estimates.
 *
 * The variance lands entirely on the weeks that are LEFT, not spread evenly
 * across the month: the earlier weeks were already spent against the planned
 * figure, so re-dividing would quietly understate every one of them after the
 * fact. Over the full period this still absorbs exactly the variance. By the
 * last week `weeksRemaining` is 1 and the remainder lands there.
 *
 * A bill that came in UNDER its estimate gives the remaining weeks more, by
 * the same rule. Callers get `weeksRemaining` from
 * weeksRemainingInPeriod() in lib/period.ts.
 */
export function adjustedWeeklyAllowance(args: {
  plannedWeekly: number;
  billVariance: number;
  weeksRemaining: number;
}): number {
  const { plannedWeekly, billVariance, weeksRemaining } = args;
  if (billVariance === 0 || weeksRemaining <= 0) return plannedWeekly;
  return Math.round((plannedWeekly - billVariance / weeksRemaining) * 100) / 100;
}

export type BudgetInputs = {
  incomeSources: Pick<IncomeSource, 'amount' | 'frequency'>[];
  extraIncome: Pick<ExtraIncome, 'amount'>[];
  bills: Pick<Bill, 'paid' | 'paid_amount' | 'amount'>[];
  goals: Pick<Goal, 'monthly_amount'>[];
  funMoneyEnabled: boolean;
  funPeople: Pick<FunMoneyPerson, 'monthly_amount'>[];
  /**
   * Whole weeks the month's pool is split across, from
   * weeksInPeriod() in lib/period.ts. Always 4 or 5.
   *
   * Deliberately required rather than defaulted: the old hardcoded 4 funded
   * only 48 weeks a year, so a silent fallback would quietly reintroduce that.
   */
  weeksInPeriod: number;
};

export type Budget = {
  totalIncome: number;
  totalFixed: number; // what bills actually cost (paid figures where known)
  plannedFixed: number; // what they were estimated at when the month was planned
  billVariance: number; // totalFixed - plannedFixed; >0 means bills ran over
  variablePool: number;
  goalsMonthly: number;
  funTotal: number;
  committed: number;
  weeksInPeriod: number; // echoed back so callers can label "split N ways"
  weeklyAllowance: number; // the PLANNED weekly figure, see adjustedWeeklyAllowance
  monthlyPool: number; // weeklyAllowance * weeksInPeriod
  fixedPct: number;
};

// ---- Weekly envelopes ("planned spending") ----

export type EnvelopeState = 'untouched' | 'on-track' | 'over' | 'skipped';

export type EnvelopeInput = {
  id: string;
  category: string;
  weekly_amount: number;
  skipped: boolean; // caller resolves skipped_week_start against the active week
};

export type EnvelopeStatus = {
  id: string;
  category: string;
  budget: number;
  spent: number;
  remaining: number; // budget − spent (negative when over)
  over: number; // max(spent − budget, 0)
  skipped: boolean;
  state: EnvelopeState;
};

export type EnvelopeSummary = {
  effAllowance: number; // weekly allowance + money returned this week
  plannedTotal: number; // Σ budgets of active (non-skipped) envelopes
  reserved: number; // Σ positive remaining of active envelopes — "still to come"
  spent: number; // total non-fun expense this week (all categories)
  freeToSpend: number; // the honest leftover
  hasEnvelopes: boolean;
  envelopes: EnvelopeStatus[];
};

/**
 * Splits the weekly allowance into spent / reserved / free once envelopes are in
 * play. Invariant: spent + reserved + freeToSpend === effAllowance (proven — an
 * over-budget envelope's overage is pulled from free, an untouched one reserves
 * its full budget). Pure and deterministic for easy verification.
 */
export function computeEnvelopes(args: {
  weeklyAllowance: number;
  incomeBack: number;
  totalNonFunExpense: number;
  spentByCategory: Record<string, number>;
  envelopes: EnvelopeInput[];
}): EnvelopeSummary {
  const { weeklyAllowance, incomeBack, totalNonFunExpense, spentByCategory, envelopes } = args;
  const effAllowance = weeklyAllowance + incomeBack;

  let plannedTotal = 0;
  let reserved = 0;
  let overageTotal = 0;
  let activeEnvelopeSpent = 0;

  const statuses: EnvelopeStatus[] = envelopes.map((e) => {
    const spent = spentByCategory[e.category] ?? 0;
    if (e.skipped) {
      // Skipped = as if the envelope doesn't exist this week: no reservation,
      // and any spend in its category flows into "other" (reduces free).
      return {
        id: e.id,
        category: e.category,
        budget: e.weekly_amount,
        spent,
        remaining: 0,
        over: 0,
        skipped: true,
        state: 'skipped',
      };
    }
    const budget = e.weekly_amount;
    const remaining = budget - spent;
    const over = Math.max(spent - budget, 0);
    plannedTotal += budget;
    reserved += Math.max(remaining, 0);
    overageTotal += over;
    activeEnvelopeSpent += spent;
    return {
      id: e.id,
      category: e.category,
      budget,
      spent,
      remaining,
      over,
      skipped: false,
      state: spent === 0 ? 'untouched' : over > 0 ? 'over' : 'on-track',
    };
  });

  const otherSpent = totalNonFunExpense - activeEnvelopeSpent;
  const freeToSpend =
    Math.round((effAllowance - plannedTotal - otherSpent - overageTotal) * 100) / 100;

  return {
    effAllowance,
    plannedTotal,
    reserved: Math.round(reserved * 100) / 100,
    spent: totalNonFunExpense,
    freeToSpend,
    hasEnvelopes: envelopes.length > 0,
    envelopes: statuses,
  };
}

export function computeBudget(inp: BudgetInputs): Budget {
  const baseIncome = inp.incomeSources.reduce((a, s) => a + monthlyEquiv(s), 0);
  const extraTotal = inp.extraIncome.reduce((a, x) => a + x.amount, 0);
  const totalIncome = baseIncome + extraTotal;
  const totalFixed = inp.bills.reduce((a, b) => a + billMonthlyCost(b), 0);
  const plannedFixed = inp.bills.reduce((a, b) => a + billPlannedCost(b), 0);
  const billVariance = Math.round((totalFixed - plannedFixed) * 100) / 100;
  const variablePool = totalIncome - totalFixed;
  const goalsMonthly = inp.goals.reduce((a, g) => a + g.monthly_amount, 0);
  const funTotal = inp.funMoneyEnabled ? inp.funPeople.reduce((a, p) => a + p.monthly_amount, 0) : 0;
  const committed = goalsMonthly + funTotal;
  // Derived from the ESTIMATES, so the weekly figure a household budgets
  // against doesn't shift retroactively the moment one bill comes in high.
  // The difference is applied to the weeks that are left, in
  // adjustedWeeklyAllowance(). Callers showing a past week use this as-is.
  //
  // Split across the period's REAL week count, not a fixed 4: a five-week
  // month genuinely has five weeks to fund, and pretending otherwise left the
  // last one paid for out of nothing.
  const weeks = Math.max(1, inp.weeksInPeriod);
  const plannedForWeeks = Math.max(0, totalIncome - plannedFixed - committed);
  const weeklyAllowance = Math.round((plannedForWeeks / weeks) * 100) / 100;
  const fixedPct = totalIncome > 0 ? Math.round((totalFixed / totalIncome) * 100) : 0;

  return {
    totalIncome,
    totalFixed,
    plannedFixed,
    billVariance,
    variablePool,
    goalsMonthly,
    funTotal,
    committed,
    weeksInPeriod: weeks,
    weeklyAllowance,
    monthlyPool: Math.round(weeklyAllowance * weeks * 100) / 100,
    fixedPct,
  };
}
