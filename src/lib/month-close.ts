import { useEffect, useRef } from 'react';

import { useHousehold } from '@/lib/household';
import { computeBudget } from '@/lib/money';
import { pendingReviewMonth } from '@/lib/month-review';
import {
  useBills,
  useCloseMonth,
  useExtraIncome,
  useFunPeople,
  useFunSettings,
  useGoals,
  useIncome,
  useMonthSnapshots,
} from '@/lib/queries';

/**
 * Ensures the most recently completed month has been "closed" — a full
 * plan+bills snapshot written, unpaid bills auto-flagged as carryover
 * reminders, and every bill reset for the fresh cycle. Fires at most once per
 * target month per mount.
 *
 * Used two ways: silently and always-on via <MonthAutoClose/> (mounted once at
 * the app root, so bills correctly reset for every household regardless of
 * whether anyone ever opens the review wizard), and as a same-tick fallback
 * inside the wizard itself (`enabled={!isPreview}`) in case it's opened before
 * the passive trigger has had a chance to run. The useCloseMonth mutation is
 * itself idempotent (unique constraint on household+month), so calling this
 * from both places at once is safe — whichever gets there first wins, the
 * other becomes a no-op.
 */
export function useEnsureMonthClosed(enabled: boolean) {
  const { householdId, household } = useHousehold();
  const bills = useBills(householdId);
  const income = useIncome(householdId);
  const extraIncome = useExtraIncome(householdId);
  const goals = useGoals(householdId);
  const funPeople = useFunPeople(householdId);
  const funSettings = useFunSettings(householdId);
  const snapshots = useMonthSnapshots(householdId);
  const closeMonth = useCloseMonth(householdId);
  const attempted = useRef<string | null>(null);

  const dataLoading =
    bills.isLoading ||
    income.isLoading ||
    extraIncome.isLoading ||
    goals.isLoading ||
    funPeople.isLoading ||
    funSettings.isLoading ||
    snapshots.isLoading;

  const reviewedMonths = (snapshots.data ?? []).map((s) => s.month);
  const target = household ? pendingReviewMonth(household.created_at, reviewedMonths) : null;

  useEffect(() => {
    if (!enabled || !household || !householdId || dataLoading || !target) return;
    if (attempted.current === target) return;
    attempted.current = target;

    // Only the plan side is computed here — computeBudget() owns that math.
    // Bill totals and carryovers are derived server-side inside close_month,
    // atomically with the reset they describe.
    const funEnabled = funSettings.data?.enabled ?? false;
    const budget = computeBudget({
      incomeSources: income.data ?? [],
      extraIncome: extraIncome.data ?? [],
      bills: bills.data ?? [],
      goals: goals.data ?? [],
      funMoneyEnabled: funEnabled,
      funPeople: funPeople.data ?? [],
    });

    closeMonth.mutate({
      month: target,
      totalIncome: budget.totalIncome,
      totalFixed: budget.totalFixed,
      goalsMonthly: budget.goalsMonthly,
      goalsSavedTotal: (goals.data ?? []).reduce((a, g) => a + g.saved_amount, 0),
      funTotal: budget.funTotal,
      weeklyAllowance: budget.weeklyAllowance,
    });
    // Deliberately excludes the *.data arrays — this should fire once per
    // target month, not re-run every time a query refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, household, householdId, dataLoading, target]);

  return { target, closing: closeMonth.isPending };
}
