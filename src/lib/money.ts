// Finance math, ported from family-budget-prototype.jsx. The weekly allowance is
// always derived, never set directly (design-brief §2):
//   (income − fixed bills − savings goals − fun money) ÷ 4
import { fundingMonthForWeek, weekStartFor, weeksRemainingInPeriod } from '@/lib/period';
import type {
  Bill,
  ExtraIncome,
  Frequency,
  FunMoneyPerson,
  Goal,
  IncomeSource,
  Transaction,
} from '@/lib/types';

type TxKind = Pick<Transaction, 'type' | 'is_fun_money'> & { transfer?: boolean };

/**
 * Money that left the week: expenses excluding each person's fun money, which
 * is committed separately as its own monthly bucket and would otherwise be
 * counted twice.
 *
 * INCLUDES transfers. Moving money into the emergency fund or onto the
 * catch-up balance costs the week exactly what it says, and the whole reason
 * those flows charge the week is so the allowance reflects it.
 *
 * Shared deliberately. Three screens each wrote this filter by hand and
 * Overview's copy left out the fun-money clause, so its "variable spending"
 * trend and category breakdown reported bigger numbers than Month Review's
 * identically-labelled figures.
 */
export function isWeekExpense(t: TxKind): boolean {
  return t.type === 'expense' && !t.is_fun_money;
}

/**
 * Spending ON something: what the category breakdown, the monthly trend and
 * the month review are built from.
 *
 * EXCLUDES transfers, which is the only difference from isWeekExpense(). Money
 * put into the emergency fund by hand, or used to pay down catch-up, really
 * does leave the week, but it was not spent on anything and reporting it as
 * such made saving look like consumption: a household moving $200 a month into
 * their fund read as spending $200 a month more than they did, filed under
 * "Other" because a transfer carries no category.
 *
 * Use isWeekExpense() for anything measuring the allowance, and this for
 * anything describing where the money went.
 */
export function isVariableExpense(t: TxKind): boolean {
  return isWeekExpense(t) && !t.transfer;
}

/**
 * Income that actually raises THIS week's spending money.
 *
 * Income can now be assigned elsewhere — to catch-up, a goal, or spread across
 * the month — and only money assigned to the week itself should move the
 * week's figure. Null means 'this_week' so every row logged before
 * destinations existed keeps behaving exactly as it did.
 */
export function isWeekIncome(
  t: Pick<Transaction, 'type'> & { income_destination?: string | null }
): boolean {
  return t.type === 'income' && (t.income_destination ?? 'this_week') === 'this_week';
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
export function catchUpBalance(entries: { amount: number }[] | undefined): number {
  return balanceFromEntries(entries);
}

/**
 * A running balance from signed entries, floored at zero.
 *
 * Shared by catch-up and the emergency fund, which are the same idea pointing
 * in opposite directions: a list of movements whose sum is the balance, so the
 * number on screen and the history behind it can never disagree. The floor
 * stops an over-withdrawal or an over-payment reading as the household being
 * owed money by itself.
 */
export function balanceFromEntries(entries: { amount: number }[] | undefined): number {
  const total = (entries ?? []).reduce((a, e) => a + Number(e.amount), 0);
  return Math.max(0, Math.round(total * 100) / 100);
}

/**
 * Whether the emergency fund's planned amount for a month has already gone in.
 *
 * Read off the entries rather than a stored flag. Goals keep the same fact in
 * `paid_this_month`, which had to be reset by the month close and, for a while,
 * wasn't — so every goal in every household read as already paid, forever.
 * A question answered from the history can't have that bug, and the unique
 * index on (household_id, month_key) means the answer is never ambiguous.
 */
export function monthlyContributionMade(
  entries: { kind: string; month_key?: string | null }[] | undefined,
  monthKey: string
): boolean {
  return (entries ?? []).some((e) => e.kind === 'monthly' && e.month_key === monthKey);
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

/**
 * The share of one-off extra income that belongs to a given week.
 *
 * Two bugs lived here. Extra income was folded into the monthly pool and
 * divided by the period's FULL week count, so a $2,000 bonus arriving with two
 * weeks left handed $1,000 of itself to weeks that had already finished and
 * been frozen — money the household could never spend. And nothing filtered by
 * date, so that same bonus went on inflating every month afterwards, forever.
 *
 * Both fall out of dividing at ARRIVAL instead. A row is split across the weeks
 * that were left when it landed, which delivers the whole amount and never
 * changes afterwards, and rows outside the week's own funding month are ignored.
 */
export function extraIncomePerWeek(args: {
  extraIncome: { amount: number; occurred_on: string }[];
  weekStart: string; // the week being asked about, YYYY-MM-DD
  weekStartsOn: number;
}): number {
  const { extraIncome, weekStart, weekStartsOn } = args;
  const period = fundingMonthForWeek(weekStart);

  const total = (extraIncome ?? []).reduce((sum, row) => {
    if (!row?.occurred_on) return sum;
    const rowWeek = weekStartFor(row.occurred_on, weekStartsOn);
    // Only this week's own funding period, and only money that had already
    // arrived by then.
    if (fundingMonthForWeek(rowWeek) !== period) return sum;
    if (rowWeek > weekStart) return sum;
    const weeksLeftAtArrival = Math.max(1, weeksRemainingInPeriod(weekStartsOn, row.occurred_on));
    return sum + Number(row.amount) / weeksLeftAtArrival;
  }, 0);

  return Math.round(total * 100) / 100;
}

export type IncomeSplit = {
  applied: number; // what the chosen destination can absorb
  overflow: number; // the rest, which goes to this week
};

/**
 * How arriving money divides between its destination and this week.
 *
 * Catch-up and goals both have a ceiling. Sending more than that used to make
 * the excess vanish: the whole amount was recorded against the destination,
 * the balance floored at zero, and the leftover appeared in no week, no goal
 * and no month. The raw total stayed negative too, so a later overspend was
 * quietly swallowed by a credit nobody could see.
 *
 * `room` is Infinity for destinations that have no ceiling.
 */
export function splitIncome(amount: number, room: number): IncomeSplit {
  const round = (n: number) => Math.round(n * 100) / 100;
  const total = Number.isFinite(amount) && amount > 0 ? round(amount) : 0;
  const ceiling = Number.isFinite(room) ? Math.max(0, round(room)) : total;
  const applied = round(Math.min(total, ceiling));
  return { applied, overflow: round(total - applied) };
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
  /** This week's share of one-off extra income, from extraIncomePerWeek(). */
  extraPerWeek?: number;
}): number {
  const { plannedWeekly, billVariance, weeksRemaining, extraPerWeek = 0 } = args;
  const variance = billVariance === 0 || weeksRemaining <= 0 ? 0 : billVariance / weeksRemaining;
  return Math.round((plannedWeekly - variance + extraPerWeek) * 100) / 100;
}

export type BudgetInputs = {
  incomeSources: Pick<IncomeSource, 'amount' | 'frequency'>[];
  extraIncome: Pick<ExtraIncome, 'amount'>[];
  bills: Pick<Bill, 'paid' | 'paid_amount' | 'amount'>[];
  goals: Pick<Goal, 'monthly_amount'>[];
  funMoneyEnabled: boolean;
  funPeople: Pick<FunMoneyPerson, 'monthly_amount'>[];
  /**
   * The emergency fund's monthly amount, held back with the goals and fun
   * money. Optional and zero by default: a household that has never set one
   * has nothing to hold back, and a wrong default here can only ever be zero,
   * unlike weeksInPeriod below where a silent fallback hid a real bug.
   */
  emergencyMonthly?: number;
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
  emergencyMonthly: number;
  committed: number;
  extraTotal: number; // one-off income; applied per week, not to the pool
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
  // The emergency fund's monthly amount is committed on exactly the same terms
  // as a savings goal's: set aside before the weekly allowance is divided, so
  // the fund grows out of the plan rather than out of whatever happens to be
  // left at the end of a week.
  const emergencyMonthly = Math.max(0, inp.emergencyMonthly ?? 0);
  const committed = goalsMonthly + funTotal + emergencyMonthly;
  // Derived from the ESTIMATES, so the weekly figure a household budgets
  // against doesn't shift retroactively the moment one bill comes in high.
  // The difference is applied to the weeks that are left, in
  // adjustedWeeklyAllowance(). Callers showing a past week use this as-is.
  //
  // Split across the period's REAL week count, not a fixed 4: a five-week
  // month genuinely has five weeks to fund, and pretending otherwise left the
  // last one paid for out of nothing.
  const weeks = Math.max(1, inp.weeksInPeriod);
  // Extra income is deliberately NOT in here. The pool is divided by the
  // period's full week count, which is right for money that was there from the
  // start and wrong for a lump that arrives midway: dividing a week-3 bonus by
  // four hands two quarters of it to weeks that are already over. It's applied
  // per-week by extraIncomePerWeek() instead, alongside bill variance.
  const plannedForWeeks = Math.max(0, totalIncome - extraTotal - plannedFixed - committed);
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
    emergencyMonthly,
    committed,
    extraTotal,
    weeksInPeriod: weeks,
    weeklyAllowance,
    monthlyPool: Math.round(weeklyAllowance * weeks * 100) / 100,
    fixedPct,
  };
}
