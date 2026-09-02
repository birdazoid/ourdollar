// Pure logic for the spend-alert push, with no Deno/Supabase dependencies so it
// can be imported by both the edge function (Deno) and the Node verification
// script (scripts/verify-spend-alert.ts). DB access lives in the callers.

// Mirror of FREQ in src/lib/money.ts. Every two weeks is NOT twice a month (26
// paychecks a year against 24) and weekly is 52/12, not 4 — treating either as
// monthly understated income badly enough to change the quoted balance.
export const FREQ_MULT: Record<string, number> = {
  monthly: 1,
  semimonthly: 2,
  biweekly: 26 / 12,
  weekly: 52 / 12,
};

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
 * The day the week is measured from. Prefer passing the transaction's
 * `occurred_on` ('YYYY-MM-DD'), which the app already writes in the
 * household's LOCAL date: the server clock is UTC, so an expense logged on a
 * US evening lands on tomorrow's UTC date and, on the last day of a week or
 * period, sent the push looking at the wrong week entirely.
 */
function anchorDay(now: Date | string): Date {
  if (typeof now === 'string') return new Date(`${now}T00:00:00Z`);
  const base = new Date(now);
  base.setUTCHours(0, 0, 0, 0);
  return base;
}

/**
 * Week bounds containing the anchor day, as YYYY-MM-DD, starting on
 * `weekStartDay` (0 = Sunday … 6 = Saturday — matches
 * households.week_start_day). Defaults to Sunday for callers that don't have a
 * household's setting on hand.
 */
export function currentWeekBounds(weekStartDay = 0, now: Date | string = new Date()) {
  const base = anchorDay(now);
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
  /**
   * One-off income. `occurred_on` is required: it is NOT part of the monthly
   * pool any more, it is divided at arrival across the weeks that were left
   * then, which cannot be worked out without the date. See
   * extraIncomePerWeek() below.
   */
  extra: { amount: number; occurred_on: string }[];
  bills: { paid: boolean; paid_amount: number | null; amount: number | null }[];
  goals: { monthly_amount: number }[];
  funEnabled: boolean;
  funPeople: { monthly_amount: number }[];
  /** The emergency fund's monthly amount, committed alongside the goals. */
  emergencyMonthly?: number;
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
export function currentPeriod(weekStartDay: number, now: Date | string = new Date()) {
  const base = anchorDay(now);
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
  const baseIncome = r.income.reduce(
    (a, s) => a + Number(s.amount) * (FREQ_MULT[s.frequency] ?? 1),
    0
  );
  const extraTotal = r.extra.reduce((a, x) => a + Number(x.amount), 0);
  const totalIncome = baseIncome + extraTotal;
  const plannedFixed = r.bills.reduce((a, b) => a + Number(b.amount ?? 0), 0);
  const goalsMonthly = r.goals.reduce((a, g) => a + Number(g.monthly_amount), 0);
  const funTotal = r.funEnabled ? r.funPeople.reduce((a, p) => a + Number(p.monthly_amount), 0) : 0;
  // The emergency fund's monthly amount is committed on the same terms as a
  // savings goal's. Leaving it out quoted a balance too high by exactly that
  // amount for any household that had set one.
  const emergencyMonthly = Math.max(0, Number(r.emergencyMonthly ?? 0));
  const committed = goalsMonthly + funTotal + emergencyMonthly;
  // Extra income is subtracted straight back out, exactly as computeBudget()
  // does it. The pool is divided by the period's FULL week count, which is
  // right for money that was there from the start and wrong for a lump that
  // lands midway: dividing a week-3 bonus by four hands half of it to weeks
  // that are already over and frozen. It is applied per week instead, by
  // extraIncomePerWeek() below. Written in this redundant-looking form so it
  // stays a visible mirror of the client's own line.
  const plannedForWeeks = Math.max(0, totalIncome - extraTotal - plannedFixed - committed);
  return Math.round((plannedForWeeks / Math.max(1, weeksInPeriod)) * 100) / 100;
}

/** 'YYYY-MM-01' for the month containing an ISO date. Mirrors monthOf(). */
export function monthOf(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** Start of the week containing an ISO date. Mirrors weekStartFor(). */
export function weekStartFor(iso: string, weekStartDay: number): string {
  const d = anchorDay(iso);
  const back = (d.getUTCDay() - weekStartDay + 7) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/**
 * The share of one-off extra income belonging to a given week. Mirrors
 * src/lib/money.ts's extraIncomePerWeek().
 *
 * Two bugs used to live in the version of this that didn't exist here at all,
 * because extra income was simply folded into the pool. It divided by the
 * period's full week count, so a $2,000 bonus arriving with two weeks left
 * gave $1,000 of itself to weeks already finished. And nothing filtered by
 * date, so an August bonus went on inflating the quoted balance in September,
 * October and every month after, forever. The app fixed both; this file did
 * not follow, so the push and the Week screen disagreed for any household that
 * had ever logged a bonus.
 *
 * Both fall out of dividing at ARRIVAL: a row is split across the weeks that
 * were left when it landed, and rows outside this week's own funding month are
 * ignored.
 */
export function extraIncomePerWeek(args: {
  extraIncome: { amount: number; occurred_on: string }[];
  weekStart: string; // the week being asked about, YYYY-MM-DD
  weekStartDay: number;
}): number {
  const { extraIncome, weekStart, weekStartDay } = args;
  const period = monthOf(weekStart);

  const total = (extraIncome ?? []).reduce((sum, row) => {
    if (!row?.occurred_on) return sum;
    const rowWeek = weekStartFor(row.occurred_on, weekStartDay);
    // Only this week's own funding period, and only money that had already
    // arrived by then.
    if (monthOf(rowWeek) !== period) return sum;
    if (rowWeek > weekStart) return sum;
    // currentPeriod(...).weeksRemaining is this file's weeksRemainingInPeriod().
    const weeksLeftAtArrival = Math.max(1, currentPeriod(weekStartDay, row.occurred_on).weeksRemaining);
    return sum + Number(row.amount) / weeksLeftAtArrival;
  }, 0);

  return Math.round(total * 100) / 100;
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

/**
 * Mirrors src/lib/money.ts's adjustedWeeklyAllowance().
 *
 * The early `return plannedWeekly` this used to open with was a second way for
 * extra income to go missing: on a week where bills came in exactly on
 * estimate, it returned before extraPerWeek could be added, and skipped the
 * rounding the client applies. There is no shortcut here now, for the same
 * reason there isn't one in the client.
 */
export function adjustedWeeklyAllowance(args: {
  plannedWeekly: number;
  billVariance: number;
  weeksRemaining: number;
  /** This week's share of one-off extra income, from extraIncomePerWeek(). */
  extraPerWeek?: number;
}): number {
  const { plannedWeekly, billVariance, weeksRemaining, extraPerWeek = 0 } = args;
  const variance = billVariance === 0 || weeksRemaining <= 0 ? 0 : billVariance / weeksRemaining;
  return Math.round((plannedWeekly - variance + extraPerWeek) * 100) / 100;
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
  weekTxns: {
    amount: number;
    type: string;
    is_fun_money: boolean;
    category: string | null;
    income_destination?: string | null;
    /** Moved rather than spent. Counts against the week, never against a
     *  planned-spending envelope. Mirrors isVariableExpense() in the client. */
    transfer?: boolean;
  }[];
  envelopes: EnvelopeInput[];
  /**
   * Signed total carried into this week by a settled rollover (Σ
   * week_rollovers.applied_amount where to_week_start = this week's start).
   * Negative when last week finished over budget. The Week screen folds this
   * into its effective allowance, so omitting it made the push quote a balance
   * that was too generous by exactly the overage the household had agreed to
   * carry.
   */
  carriedIn?: number;
}): number {
  const { weeklyAllowance, weekTxns, envelopes, carriedIn = 0 } = args;
  const expenses = weekTxns.filter((t) => t.type === 'expense' && !t.is_fun_money);
  const totalNonFunExpense = expenses.reduce((a, t) => a + Number(t.amount), 0);
  // Mirrors isWeekIncome() in src/lib/money.ts. Income assigned to catch-up, a
  // goal, or the month does NOT raise this week, so counting every income row
  // here would quote a balance higher than the app's.
  const incomeBack = weekTxns
    .filter((t) => t.type === 'income' && (t.income_destination ?? 'this_week') === 'this_week')
    .reduce((a, t) => a + Number(t.amount), 0);

  // Transfers stay in totalNonFunExpense above (the money did leave the week)
  // but are kept out of the per-category totals, so moving $200 to the
  // emergency fund comes out of free money rather than eating the Groceries
  // budget. Same split the client makes between isWeekExpense and
  // isVariableExpense.
  const spentByCategory: Record<string, number> = {};
  for (const t of expenses) {
    if (t.transfer) continue;
    const key = t.category ?? 'other';
    spentByCategory[key] = (spentByCategory[key] ?? 0) + Number(t.amount);
  }

  const effAllowance = weeklyAllowance + incomeBack + carriedIn;
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
  /** Moved rather than spent — into the emergency fund, or onto catch-up. */
  transfer?: boolean;
  /** The transfer's own label, e.g. "To emergency fund". Ignored otherwise. */
  label?: string | null;
}): string {
  const balanceText =
    args.remaining < 0 ? `${fmt(-args.remaining)} over budget` : `${fmt(args.remaining)} left this week`;

  // A transfer still deserves a push — the week really did drop, and the other
  // half of the household should know — but calling it "spent on Other" was
  // wrong twice over: it wasn't spending, and "Other" is just the fallback for
  // the category a transfer deliberately doesn't have.
  if (args.transfer) {
    const where = (args.label ?? '').trim().toLowerCase();
    const destination = where.startsWith('to') || where.startsWith('toward') ? where : `to ${where}`;
    return `${args.spenderName} moved ${fmt(Number(args.amount))} ${destination} — ${balanceText}`;
  }

  const categoryName = CATEGORY_NAME[args.category ?? 'other'] ?? 'spending';
  return `${args.spenderName} spent ${fmt(Number(args.amount))} on ${categoryName} — ${balanceText}`;
}
