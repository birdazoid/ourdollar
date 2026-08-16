// Finance math, ported from family-budget-prototype.jsx. The weekly allowance is
// always derived, never set directly (design-brief §2):
//   (income − fixed bills − savings goals − fun money) ÷ 4
import type {
  Bill,
  ExtraIncome,
  Frequency,
  FunMoneyPerson,
  Goal,
  IncomeSource,
  Transaction,
} from '@/lib/types';

type TxKind = Pick<Transaction, 'type' | 'is_fun_money'>;

/**
 * The spending the budget is measured against: expenses excluding each
 * person's fun money, which is committed separately as its own monthly bucket
 * and would otherwise be counted twice.
 *
 * Shared deliberately. Three screens each wrote this filter by hand and
 * Overview's copy left out the fun-money clause, so its "variable spending"
 * trend and category breakdown reported bigger numbers than Month Review's
 * identically-labelled figures.
 */
export function isVariableExpense(t: TxKind): boolean {
  return t.type === 'expense' && !t.is_fun_money;
}

/** A person's own fun money, which the weekly and monthly totals leave out. */
export function isFunExpense(t: TxKind): boolean {
  return t.type === 'expense' && t.is_fun_money;
}

/**
 * How much of a person's fun money is gone this month.
 *
 * Scoped to the CALENDAR MONTH because fun money is set as a monthly amount.
 * The Week screen used to total only the current week against that monthly
 * figure, so the ring reset every week: $30 a week against a $100 month came
 * to $120 spent and still displayed $70 left, every week, forever.
 */
export function funMoneyUsed(args: {
  transactions: Pick<Transaction, 'type' | 'is_fun_money' | 'member_id' | 'occurred_on' | 'amount'>[];
  memberId: string | null;
  monthKey: string; // 'YYYY-MM'
}): number {
  const { transactions, memberId, monthKey } = args;
  const total = transactions
    .filter((t) => isFunExpense(t) && t.member_id === memberId && t.occurred_on.slice(0, 7) === monthKey)
    .reduce((a, t) => a + Number(t.amount), 0);
  return Math.round(total * 100) / 100;
}

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

/**
 * "$1,234" or "$12.50" — cents only when non-integer. Null → em dash.
 *
 * NaN and Infinity degrade to the same dash rather than rendering "$NaN" or
 * "$∞". They shouldn't reach here, but a money app that prints "$NaN" at a
 * household has lost their trust in every other figure on the screen too, and
 * a dash at least reads as "we don't know".
 */
export function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
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
 * What's still owed on the catch-up balance.
 *
 * Summed from the entries rather than stored anywhere, so the figure and its
 * own history can never disagree. Floored at zero: overpaying should read as
 * "settled", not as the household being owed money by itself.
 *
 * Lives here rather than beside its queries because it is pure, and the verify
 * scripts can't import anything that reaches react-native.
 */
export function catchUpBalance(
  entries: { amount: number }[] | undefined
): number {
  const total = (entries ?? []).reduce((a, e) => a + Number(e.amount), 0);
  return Math.max(0, Math.round(total * 100) / 100);
}

/**
 * How far along a savings goal is, as 0…1.
 *
 * Guards the divide. Two screens computed `saved / target` directly, so a goal
 * with a zero target produced NaN, which reached the UI as "NaN%" and a
 * `width: "NaN%"` style on the progress bar. The goal form validates target > 0
 * but nothing in the database enforces it, so a seed script or a direct write
 * was one step away from a broken screen.
 */
export function goalProgress(saved: number, target: number): number {
  if (!Number.isFinite(saved) || !Number.isFinite(target) || target <= 0) return 0;
  return Math.max(0, Math.min(1, saved / target));
}

export type DeltaDescription = {
  text: string; // "$99 more", "$40 less", or "No change"
  good: boolean; // the movement went the way the household wants
  flat: boolean;
};

/**
 * How a month-over-month change should read.
 *
 * Words rather than a bare arrow: "↑ $99" makes the reader work out whether up
 * is good, and the answer depends on what's moving. A rise in income is
 * welcome, a rise in bills is not, so `invert` marks the rows where up is bad.
 *
 * Zero reads as "No change". The arrow form rendered it as "↓ $0", because
 * `delta <= 0` quietly counted nothing as a decrease.
 */
export function describeDelta(delta: number, opts: { invert?: boolean } = {}): DeltaDescription {
  const rounded = Math.round(delta * 100) / 100;
  if (rounded === 0) return { text: 'No change', good: true, flat: true };
  const up = rounded > 0;
  return {
    text: `${fmt(Math.abs(rounded))} ${up ? 'more' : 'less'}`,
    good: opts.invert ? !up : up,
    flat: false,
  };
}

/**
 * Keeps only what can belong to a dollar figure: digits and a single decimal
 * point. Commas are stripped, so the grouped string a field displays sanitizes
 * straight back to something Number() can read.
 *
 * A second "." is dropped rather than kept: Number('1.2.3') is NaN and
 * parseFloat('1.2.3') is 1.2, so letting one through means either a silent
 * failure or a silently wrong amount.
 */
export function sanitizeAmountInput(text: string): string {
  const cleaned = text.replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
}

/**
 * Thousands separators for an amount that's still being typed: "1234.5" →
 * "1,234.5". Pair it with sanitizeAmountInput() on the way back in.
 *
 * Only the whole-dollar part is touched. The fraction is echoed back exactly as
 * typed so a half-finished "1234." keeps its point and "1,234.50" doesn't
 * collapse to "1,234.5" under the cursor — round-tripping through a number
 * would eat both.
 */
export function groupAmountInput(raw: string): string {
  const dot = raw.indexOf('.');
  const whole = dot === -1 ? raw : raw.slice(0, dot);
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return dot === -1 ? grouped : grouped + raw.slice(dot);
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
  /**
   * Σ over-budget spill of active envelopes. ALREADY removed from freeToSpend
   * (and already counted inside `spent`) — an envelope only reserves its own
   * budget, so anything past it has to come from somewhere, and free is the
   * only place left. Returned so the Week screen can show that deduction as a
   * line the household can see, rather than free-to-spend silently dropping.
   * Do not subtract it again.
   */
  overage: number;
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
    overage: Math.round(overageTotal * 100) / 100,
    freeToSpend,
    hasEnvelopes: envelopes.length > 0,
    envelopes: statuses,
  };
}

export type AllowancePots = {
  plannedUsed: number; // spent inside envelopes, capped at their budgets
  plannedLeft: number; // === summary.reserved, the still-to-spend part
  plannedPot: number; // the whole planned block, a FIXED width that fills
  overage: number; // spill past an envelope, charged to free
  otherSpent: number; // un-enveloped and skipped-category spend, charged to free
  freeLeft: number; // freeToSpend, floored at 0 for layout
  freePot: number; // overage + otherSpent + freeLeft
};

/**
 * The weekly allowance seen as TWO pots rather than three peer slices.
 *
 * Planned money is set aside up front, so spending inside an envelope fills
 * that envelope and free-to-spend does not move; only the spill crosses over.
 * A "spent | planned | free" bar said the opposite — it read as though every
 * expense came off the top of everything — which is exactly the confusion this
 * split exists to kill.
 *
 *   [ planned: used | still to spend ][ free: spent from free | left ]
 *
 * Invariant: plannedPot + freePot === effAllowance − min(freeToSpend, 0). The
 * subtraction is only the clamp on an over-budget week, where freeLeft floors
 * at 0 so a negative can't render as a backwards bar.
 */
export function splitAllowancePots(s: EnvelopeSummary): AllowancePots {
  const round = (n: number) => Math.round(n * 100) / 100;
  const plannedUsed = Math.max(round(s.plannedTotal - s.reserved), 0);
  // `spent` counts every non-fun expense, and the part inside active envelopes
  // is exactly plannedUsed + overage, so the rest is what free is paying for.
  const otherSpent = Math.max(round(s.spent - plannedUsed - s.overage), 0);
  const freeLeft = Math.max(s.freeToSpend, 0);
  return {
    plannedUsed,
    plannedLeft: s.reserved,
    plannedPot: s.plannedTotal,
    overage: s.overage,
    otherSpent,
    freeLeft,
    freePot: round(s.overage + otherSpent + freeLeft),
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
