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
