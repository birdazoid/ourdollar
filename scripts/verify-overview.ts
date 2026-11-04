/**
 * Verifies the Overview "Left after bills" breakdown. Pure, no database.
 *
 * The rows under that figure must add up to it, and the "Bills came in
 * under/over" row must only appear when a bill really differs from its estimate.
 * Extra income used to break both: it counted toward the total but not the
 * monthly pool, so a $250 payment also showed up as bills coming in $250 under.
 *
 * Run: npm run verify:overview
 */
import { computeBudget, unallocatedAfterPlan, type BudgetInputs } from '../src/lib/money';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) {
    passed++;
    console.log(`  ✅ ${label}${detail ? `: ${detail}` : ''}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}${detail ? `: ${detail}` : ''}`);
  }
}

const bill = (amount: number, paidAmount?: number) => ({
  amount,
  paid: paidAmount !== undefined,
  paid_amount: paidAmount ?? null,
});

// The same figures as the Cooper Household in scripts/seed-demo.ts.
const DEMO_BILLS = [1800, 340, 145, 60, 32, 85, 150, 25, 40];
const demo = (overrides: Partial<BudgetInputs> = {}): BudgetInputs => ({
  incomeSources: [
    { amount: 2600, frequency: 'semimonthly' },
    { amount: 3200, frequency: 'monthly' },
  ],
  extraIncome: [{ amount: 250 }],
  // Paid at exactly their estimates, as the seed does.
  bills: DEMO_BILLS.map((amount) => bill(amount, amount)),
  goals: [500, 300, 150, 50, 400].map((monthly_amount) => ({ monthly_amount })),
  funMoneyEnabled: true,
  funPeople: [120, 90, 40].map((monthly_amount) => ({ monthly_amount })),
  weeksInPeriod: 4,
  ...overrides,
});

/** The rows under "Left after bills" add back up to it, to the cent. */
function rowsSum(b: ReturnType<typeof computeBudget>) {
  const gap = unallocatedAfterPlan(b);
  const total = b.monthlyPool + b.goalsMonthly + b.funTotal + b.extraTotal + gap;
  return Math.round(total * 100) === Math.round(b.variablePool * 100);
}

console.log('\n1. Demo household: one-off income, bills match their estimates');
for (const weeksInPeriod of [4, 5]) {
  const b = computeBudget(demo({ weeksInPeriod }));
  check(`left after bills is $5,973 (${weeksInPeriod} weeks)`, b.variablePool === 5973, `${b.variablePool}`);
  check(`no bill difference row (${weeksInPeriod} weeks)`, unallocatedAfterPlan(b) === 0, `${unallocatedAfterPlan(b)}`);
  check(`rows sum to left after bills (${weeksInPeriod} weeks)`, rowsSum(b));
}

console.log('\n2. Real bill differences still show');
{
  // Electric & gas estimated at $145.
  const over = computeBudget(demo({ bills: [bill(1800, 1800), bill(145, 200)] }));
  check('a bill $55 over shows as −55, extra income aside', unallocatedAfterPlan(over) === -55, `${unallocatedAfterPlan(over)}`);
  check('and the rows still sum', rowsSum(over));

  const under = computeBudget(demo({ bills: [bill(1800, 1800), bill(145, 100)] }));
  check('a bill $45 under shows as +45, extra income aside', unallocatedAfterPlan(under) === 45, `${unallocatedAfterPlan(under)}`);
  check('and the rows still sum', rowsSum(under));

  const noExtra = computeBudget(demo({ extraIncome: [], bills: [bill(145, 200)] }));
  check('same answer with no extra income at all', unallocatedAfterPlan(noExtra) === -55, `${unallocatedAfterPlan(noExtra)}`);
}

console.log('\n3. Closed month: the record folds extra income into total income');
{
  // Mirrors the snapshot branch of Overview: what useEnsureMonthClosed() saves,
  // read back with extraTotal 0 because no separate figure is kept.
  const closed = (b: ReturnType<typeof computeBudget>) => ({
    variablePool: b.totalIncome - b.totalFixed,
    monthlyPool: b.weeklyAllowance * b.weeksInPeriod,
    goalsMonthly: b.goalsMonthly,
    funTotal: b.funTotal,
    extraTotal: 0,
  });

  const withExtra = closed(computeBudget(demo()));
  check(
    'extra income lands in the gap, which is why that row must not blame bills',
    unallocatedAfterPlan(withExtra) === 250,
    `${unallocatedAfterPlan(withExtra)}`
  );

  const plain = closed(computeBudget(demo({ extraIncome: [] })));
  check('no extra income and matching bills leaves no row', unallocatedAfterPlan(plain) === 0, `${unallocatedAfterPlan(plain)}`);

  const billsOver = closed(computeBudget(demo({ extraIncome: [], bills: [bill(145, 200)] })));
  check('a real bill difference still shows', unallocatedAfterPlan(billsOver) === -55, `${unallocatedAfterPlan(billsOver)}`);
}

console.log(`\n${failed === 0 ? '✅ ALL CHECKS PASSED' : '❌ FAILURES'}: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
