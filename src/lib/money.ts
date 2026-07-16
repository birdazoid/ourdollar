// Finance math, ported from family-budget-prototype.jsx. The weekly allowance is
// always derived, never set directly (design-brief §2):
//   (income − fixed bills − savings goals − fun money) ÷ 4
import type { Bill, ExtraIncome, Frequency, FunMoneyPerson, Goal, IncomeSource } from '@/lib/types';

export const FREQ: Record<Frequency, { label: string; mult: number }> = {
  monthly: { label: 'Monthly', mult: 1 },
  semimonthly: { label: 'Twice a month', mult: 2 },
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

export function billMonthlyCost(bill: Pick<Bill, 'paid' | 'paid_amount' | 'amount'>): number {
  return bill.paid ? bill.paid_amount ?? bill.amount ?? 0 : bill.amount ?? 0;
}

export type BudgetInputs = {
  incomeSources: Pick<IncomeSource, 'amount' | 'frequency'>[];
  extraIncome: Pick<ExtraIncome, 'amount'>[];
  bills: Pick<Bill, 'paid' | 'paid_amount' | 'amount'>[];
  goals: Pick<Goal, 'monthly_amount'>[];
  funMoneyEnabled: boolean;
  funPeople: Pick<FunMoneyPerson, 'monthly_amount'>[];
};

export type Budget = {
  totalIncome: number;
  totalFixed: number;
  variablePool: number;
  goalsMonthly: number;
  funTotal: number;
  committed: number;
  weeklyAllowance: number;
  monthlyPool: number; // weeklyAllowance * 4
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
  const variablePool = totalIncome - totalFixed;
  const goalsMonthly = inp.goals.reduce((a, g) => a + g.monthly_amount, 0);
  const funTotal = inp.funMoneyEnabled ? inp.funPeople.reduce((a, p) => a + p.monthly_amount, 0) : 0;
  const committed = goalsMonthly + funTotal;
  const remainingForWeeks = Math.max(0, variablePool - committed);
  const weeklyAllowance = Math.round((remainingForWeeks / 4) * 100) / 100;
  const fixedPct = totalIncome > 0 ? Math.round((totalFixed / totalIncome) * 100) : 0;

  return {
    totalIncome,
    totalFixed,
    variablePool,
    goalsMonthly,
    funTotal,
    committed,
    weeklyAllowance,
    monthlyPool: weeklyAllowance * 4,
    fixedPct,
  };
}
