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

/** Sunday-start week bounds containing today, as YYYY-MM-DD (UTC). */
export function currentWeekBounds(now = new Date()) {
  const base = new Date(now);
  base.setUTCHours(0, 0, 0, 0);
  const sunday = new Date(base);
  sunday.setUTCDate(base.getUTCDate() - base.getUTCDay());
  const saturday = new Date(sunday);
  saturday.setUTCDate(sunday.getUTCDate() + 6);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(sunday), end: iso(saturday) };
}

export type BudgetRows = {
  income: { amount: number; frequency: string }[];
  extra: { amount: number }[];
  bills: { paid: boolean; paid_amount: number | null; amount: number | null }[];
  goals: { monthly_amount: number }[];
  funEnabled: boolean;
  funPeople: { monthly_amount: number }[];
};

export function weeklyAllowanceFrom(r: BudgetRows): number {
  const totalIncome =
    r.income.reduce((a, s) => a + Number(s.amount) * (FREQ_MULT[s.frequency] ?? 1), 0) +
    r.extra.reduce((a, x) => a + Number(x.amount), 0);
  const totalFixed = r.bills.reduce(
    (a, b) => a + (b.paid ? Number(b.paid_amount ?? b.amount ?? 0) : Number(b.amount ?? 0)),
    0
  );
  const goalsMonthly = r.goals.reduce((a, g) => a + Number(g.monthly_amount), 0);
  const funTotal = r.funEnabled ? r.funPeople.reduce((a, p) => a + Number(p.monthly_amount), 0) : 0;
  return Math.max(0, Math.round(((totalIncome - totalFixed - goalsMonthly - funTotal) / 4) * 100) / 100);
}

export function weekRemaining(
  weeklyAllowance: number,
  weekTxns: { amount: number; type: string; is_fun_money: boolean }[]
): number {
  const weekSpent = weekTxns
    .filter((t) => t.type === 'expense' && !t.is_fun_money)
    .reduce((a, t) => a + Number(t.amount), 0);
  const incomeBack = weekTxns.filter((t) => t.type === 'income').reduce((a, t) => a + Number(t.amount), 0);
  return weeklyAllowance - weekSpent + incomeBack;
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
