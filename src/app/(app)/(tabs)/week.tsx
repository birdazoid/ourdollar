import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, CornerDownRight, Plus, TrendingDown } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import IconBills from '@/assets/icons/icon-bills.svg';
import IconFreeToSpend from '@/assets/icons/icon-free-to-spend.svg';
import IconGiftBox from '@/assets/icons/icon-gift-box.svg';
import { Card } from '@/components/card';
import { CategoryGlyph } from '@/components/category-glyph';
import { EnvelopeSheet } from '@/components/envelope-sheet';
import { BoundaryNotice } from '@/components/boundary-notice';
import { HeroCard } from '@/components/hero-card';
import { ListRow } from '@/components/list-row';
import { Ring } from '@/components/ring';
import { RolloverPrompt } from '@/components/rollover-prompt';
import { LoadError } from '@/components/load-error';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SectionHeader } from '@/components/section-header';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useToday } from '@/hooks/use-today';
import { useSession } from '@/lib/auth';
import { txCategoryById } from '@/lib/categories';
import { useHousehold } from '@/lib/household';
import {
  adjustedWeeklyAllowance,
  catchUpBalance,
  computeBudget,
  computeEnvelopes,
  fmt,
  funMoneyUsed,
  isVariableExpense,
  splitAllowancePots,
  type EnvelopeStatus,
} from '@/lib/money';
import { fundingMonthForWeek, weeksInPeriod, weeksRemainingInPeriod } from '@/lib/period';
import {
  useBills,
  useEnvelopes,
  useEnvelopeMutations,
  useExtraIncome,
  useFunPeople,
  useFunSettings,
  useGoals,
  useIncome,
  useCatchUpEntries,
  useCatchUpMutations,
  useMembers,
  useRecordWeekResult,
  useRolloverSettled,
  useSettleRollover,
  useTransactions,
  useWeekAdjustment,
  useWeekResult,
  type EnvelopeDraft,
  type RolloverResolution,
} from '@/lib/queries';
import type { Transaction, WeeklyEnvelope } from '@/lib/types';
import { dayHeading, getWeek, weekRangeLabel } from '@/lib/week';

export default function WeekScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { householdId, household } = useHousehold();
  const weekStart = household?.week_start_day ?? 0;

  const members = useMembers(householdId);
  const transactions = useTransactions(householdId);
  const income = useIncome(householdId);
  const extraIncome = useExtraIncome(householdId);
  const bills = useBills(householdId);
  const goals = useGoals(householdId);
  const funPeople = useFunPeople(householdId);
  const funSettings = useFunSettings(householdId);
  const envelopes = useEnvelopes(householdId);
  const envMut = useEnvelopeMutations(householdId);
  const catchUp = useCatchUpEntries(householdId);
  const catchUpMut = useCatchUpMutations(householdId);

  const [offset, setOffset] = useState(0);
  const [envSheet, setEnvSheet] = useState<{ envelope: WeeklyEnvelope | null } | null>(null);
  const isCurrent = offset === 0;
  // Keyed on today's date so a backgrounded app that comes back on a new week
  // (or crosses midnight while open) re-derives instead of holding the week it
  // launched on until it's force-quit.
  const today = useToday();
  const week = useMemo(() => getWeek(offset, weekStart, today), [offset, weekStart, today]);
  const lastWeek = useMemo(() => getWeek(-1, weekStart, today), [weekStart, today]);

  const funEnabled = funSettings.data?.enabled ?? false;
  // A week is funded by the month whose period contains it, which is simply the
  // month its start date falls in. That's what stops a week spanning the
  // boundary from being paid for out of two months at once.
  const fundingMonth = fundingMonthForWeek(week.start);
  // Everything computeBudget needs except the week count, which is per-period —
  // last week's rollover figure below re-derives with its own.
  const budgetInputs = {
    incomeSources: income.data ?? [],
    extraIncome: extraIncome.data ?? [],
    bills: bills.data ?? [],
    goals: goals.data ?? [],
    funMoneyEnabled: funEnabled,
    funPeople: funPeople.data ?? [],
  };
  const budget = computeBudget({
    ...budgetInputs,
    weeksInPeriod: weeksInPeriod(fundingMonth, weekStart),
  });
  // Bills that came in over (or under) their estimate are absorbed by the weeks
  // still left in the period.
  const weeksLeft = weeksRemainingInPeriod(weekStart);
  const liveAllowance = adjustedWeeklyAllowance({
    plannedWeekly: budget.weeklyAllowance,
    billVariance: budget.billVariance,
    weeksRemaining: weeksLeft,
  });

  /**
   * What the week being viewed was worth.
   *
   * A finished week reads its RECORDED figure, never a fresh calculation. The
   * screen used to recompute every past week from today's income and bills, so
   * a pay rise silently rewrote history: a week settled at $563.25 over later
   * displayed as $592.75 over, because the weekly figure had gone up by $78
   * after that week had already ended.
   *
   * `null` means nobody opened the app during that week, so there's nothing on
   * record and the best we can do is estimate from today's figures. The screen
   * says so rather than passing the estimate off as history.
   */
  const weekResult = useWeekResult(householdId, week.start);
  const recordedAllowance = weekResult.data ?? null;
  const estimatingPastWeek = !isCurrent && !weekResult.isLoading && recordedAllowance == null;
  const allowance = isCurrent ? liveAllowance : recordedAllowance ?? budget.weeklyAllowance;

  /**
   * Keep this week's figure on record while the week is still running, so it
   * stays true as bills land and income changes. Once the week ends nothing
   * writes to it again, which is what freezes it.
   */
  const recordWeek = useRecordWeekResult(householdId);
  useEffect(() => {
    if (!householdId || !isCurrent || weekResult.isLoading) return;
    if (recordedAllowance != null && Math.abs(recordedAllowance - liveAllowance) < 0.005) return;
    if (recordWeek.isPending) return;
    recordWeek.mutate({ weekStart: week.start, weeklyAllowance: liveAllowance });
    // `recordWeek` is a stable mutation object; including it would re-run this
    // on every render as its own pending state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, isCurrent, weekResult.isLoading, recordedAllowance, liveAllowance, week.start]);

  const weekTxns = (transactions.data ?? []).filter(
    (t) => t.occurred_on >= week.start && t.occurred_on <= week.end
  );
  const spent = weekTxns
    .filter(isVariableExpense)
    .reduce((a, t) => a + t.amount, 0);
  const incomeBack = weekTxns.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0);

  // Fun money is a MONTHLY pot, so it's measured over the calendar month
  // rather than the week this screen is otherwise about.
  const funMonthKey = today.slice(0, 7);
  const monthName = new Date(`${today}T00:00:00`).toLocaleDateString('en-US', { month: 'long' });

  // Any amount carried into this specific week from settling a prior week's
  // leftover/overage (0 for a week with no settlement targeting it).
  const weekAdjustment = useWeekAdjustment(householdId, week.start);
  const adjustment = weekAdjustment.data ?? 0;

  const remaining = allowance - spent + incomeBack + adjustment;
  const over = remaining < 0;
  const frac = over ? 1 : allowance > 0 ? Math.max(0, Math.min(1, remaining / allowance)) : 0;

  // Rollover prompt: ask (only once, only for the current week) what to do with
  // last week's leftover/overage rather than silently folding it in.
  const lastWeekTxns = (transactions.data ?? []).filter(
    (t) => t.occurred_on >= lastWeek.start && t.occurred_on <= lastWeek.end
  );
  const lastSpent = lastWeekTxns
    .filter(isVariableExpense)
    .reduce((a, t) => a + t.amount, 0);
  const lastIncomeBack = lastWeekTxns.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0);
  // Measured against what last week was PLANNED at, not this week's allowance:
  // `allowance` carries the current week's bill-variance adjustment, which was
  // never last week's number. The two weeks can also sit in different funding
  // months, and a 5-week month funds a smaller weekly figure than a 4-week one,
  // so the week count has to come from last week's own period.
  const lastFundingMonth = fundingMonthForWeek(lastWeek.start);
  // Prefer what last week was RECORDED at. Falling back to a recalculation is
  // what made the prompt disagree with the week it was settling.
  const lastWeekResult = useWeekResult(householdId, isCurrent ? lastWeek.start : null);
  const lastPlannedWeekly =
    lastWeekResult.data ??
    (lastFundingMonth === fundingMonth
      ? budget.weeklyAllowance
      : computeBudget({
          ...budgetInputs,
          weeksInPeriod: weeksInPeriod(lastFundingMonth, weekStart),
        }).weeklyAllowance);
  /**
   * Money carried INTO last week when the week before it was settled.
   *
   * Leaving it out made the prompt disagree with the Week screen, which has
   * always included it, and worse: the carried amount quietly left the books.
   * Carry $107.50 of overspend into last week, and last week's own settlement
   * would then act as though that debt had never been carried, so it was
   * written off without anyone choosing to write it off.
   */
  const lastWeekAdjustment = useWeekAdjustment(householdId, isCurrent ? lastWeek.start : null);
  const lastAdjustment = lastWeekAdjustment.data ?? 0;
  const lastRemaining =
    Math.round((lastPlannedWeekly - lastSpent + lastIncomeBack + lastAdjustment) * 100) / 100;

  const rolloverSettled = useRolloverSettled(householdId, isCurrent ? lastWeek.start : null);
  const settleRollover = useSettleRollover(householdId);
  const me = (members.data ?? []).find((m) => m.account_id === session?.user.id) ?? null;

  // A week the household didn't exist for has no transactions to subtract, so
  // its untouched allowance would read as a full week saved and could be banked
  // as real money. Nobody rolls over from before they signed up.
  const existedLastWeek = !!household && household.created_at.slice(0, 10) <= lastWeek.start;

  const showRolloverPrompt =
    isCurrent &&
    existedLastWeek &&
    lastPlannedWeekly > 0 &&
    lastRemaining !== 0 &&
    rolloverSettled.data === false;

  function resolveRollover(resolution: RolloverResolution, goalId?: string) {
    const goal = goalId ? (goals.data ?? []).find((g) => g.id === goalId) : undefined;

    // Catch-up records the money on its own balance instead of moving it into
    // a week or a goal, so `applied_amount` stays 0 and no allowance shifts.
    if (resolution === 'catch_up') {
      const owed = catchUpBalance(catchUp.data);
      catchUpMut.add.mutate(
        lastRemaining < 0
          ? {
              amount: -lastRemaining, // overage becomes a positive debt
              kind: 'week_overage',
              note: `Week of ${weekRangeLabel(lastWeek.days)}`,
              sourceWeekStart: lastWeek.start,
              memberId: me?.id ?? null,
            }
          : {
              // Never pay off more than is owed, or the balance would go
              // negative and read as the household being owed money.
              amount: -Math.min(lastRemaining, owed),
              kind: 'payment',
              note: `Left over from the week of ${weekRangeLabel(lastWeek.days)}`,
              sourceWeekStart: lastWeek.start,
              memberId: me?.id ?? null,
            }
      );
    }

    settleRollover.mutate({
      fromWeekStart: lastWeek.start,
      toWeekStart: week.start,
      amount: lastRemaining,
      resolution,
      goalId,
      goalSavedAmount: goal?.saved_amount,
      goalTargetAmount: goal?.target_amount,
      settledByMemberId: me?.id ?? null,
    });
  }

  // Envelopes ("planned spending") reshape the CURRENT week only — past weeks
  // keep the plain "money left" view (budgets/skip aren't tracked historically).
  const spentByCategory: Record<string, number> = {};
  for (const t of weekTxns) {
    if (isVariableExpense(t)) {
      const c = t.category ?? 'other';
      spentByCategory[c] = (spentByCategory[c] ?? 0) + t.amount;
    }
  }
  const envSummary = computeEnvelopes({
    weeklyAllowance: allowance,
    incomeBack: incomeBack + adjustment,
    totalNonFunExpense: spent,
    spentByCategory,
    envelopes: (envelopes.data ?? []).map((e) => ({
      id: e.id,
      category: e.category,
      weekly_amount: e.weekly_amount,
      skipped: isCurrent && e.skipped_week_start === week.start,
    })),
  });
  const showEnvelopes = isCurrent && envSummary.hasEnvelopes;
  const envFree = envSummary.freeToSpend;
  // Over budget fills the whole ring (in red) rather than emptying it — an
  // empty ring reads as "nothing spent", the opposite of what's happening.
  const envFreeFrac =
    envFree < 0
      ? 1
      : envSummary.effAllowance > 0
        ? Math.max(0, Math.min(1, envFree / envSummary.effAllowance))
        : 0;

  // The allowance as two pots (planned / free), which is what the bar below
  // draws. See splitAllowancePots for why three peer slices misled.
  const pots = splitAllowancePots(envSummary);

  // Which categories overspent, for the deduction line below. Named rather than
  // just totalled: "Fuel $13" tells you what to do about it, "-$13" doesn't.
  const overCategories = envSummary.envelopes.filter((e) => e.over > 0);
  const overageDetail =
    overCategories.length <= 2
      ? overCategories.map((e) => `${txCategoryById(e.category).name} ${fmt(e.over)}`).join(' · ')
      : `${overCategories.length} categories`;

  function toggleSkip(env: EnvelopeStatus) {
    envMut.setSkip.mutate({ id: env.id, weekStart: env.skipped ? null : week.start });
  }

  const usedCategories = (envelopes.data ?? []).map((e) => e.category);
  const rawEnvelope = (id: string) => (envelopes.data ?? []).find((e) => e.id === id) ?? null;
  function saveEnvelope(draft: EnvelopeDraft, id?: string) {
    if (id) envMut.update.mutate({ id, weekly_amount: draft.weekly_amount });
    else envMut.add.mutate(draft);
    setEnvSheet(null);
  }
  function removeEnvelope(id: string) {
    envMut.remove.mutate(id);
    setEnvSheet(null);
  }

  const memberName = (id: string | null) =>
    (members.data ?? []).find((m) => m.id === id)?.name ?? 'Someone';

  const dayGroups = useMemo(() => {
    const byDay: Record<string, Transaction[]> = {};
    weekTxns.forEach((t) => {
      (byDay[t.occurred_on] = byDay[t.occurred_on] || []).push(t);
    });
    return Object.keys(byDay)
      .sort((a, b) => (a < b ? 1 : -1))
      .map((date) => ({ date, heading: dayHeading(date), items: byDay[date] }));
  }, [weekTxns]);

  const loading = !householdId || transactions.isLoading || income.isLoading;
  // A failed fetch left `data` undefined, the `?? []` fallbacks took over, and
  // this screen rendered "Nothing logged for this week yet" on a week with
  // plenty logged. Report the failure instead of inventing an empty week.
  const loadFailed = transactions.isError || income.isError || bills.isError;
  const retryLoad = () => {
    transactions.refetch();
    income.refetch();
    bills.refetch();
  };

  return (
    <Screen>
      <ScreenHeader eyebrow="This week" title="Week" />

      {loading ? (
        <ActivityIndicator color={Palette.sageDeep} style={styles.loading} />
      ) : loadFailed ? (
        <LoadError onRetry={retryLoad} what="your week" />
      ) : (
        <>
          {showEnvelopes ? (
            <HeroCard
              eyebrow="This week's free-to-spend"
              big={envFree < 0 ? '-' + fmt(-envFree) : fmt(envFree)}
              bigColor={envFree < 0 ? Palette.terracottaDeep : Palette.ink}
              // Not "$56 spent", which sat under the free-to-spend figure and
              // implied the spending had come out of it. Money in a planned
              // category never touches this number until it overflows.
              sub={
                envSummary.plannedTotal > 0
                  ? `${fmt(envSummary.plannedTotal)} set aside · ${fmt(envSummary.reserved)} of it still to spend`
                  : `${fmt(envSummary.spent)} spent this week`
              }
              subColor={envFree < 0 ? Palette.terracottaDeep : undefined}
              ringValue={envFreeFrac}
              ringColor={envFree < 0 ? Palette.terracottaDeep : Palette.sage}
              ringLabel={envFree < 0 ? 'over' : 'free'}
              ringCenter=""
            />
          ) : (
            <HeroCard
              eyebrow={isCurrent ? "This week's spending money" : `Week of ${weekRangeLabel(week.days)}`}
              big={over ? '-' + fmt(-remaining) : fmt(remaining)}
              bigColor={over ? Palette.terracottaDeep : Palette.ink}
              sub={over ? `${fmt(-remaining)} over budget` : `${fmt(spent)} spent of ${fmt(allowance)}`}
              subColor={over ? Palette.terracottaDeep : undefined}
              ringValue={frac}
              ringColor={over ? Palette.terracottaDeep : Palette.sage}
              ringLabel={over ? 'over' : 'left'}
              ringCenter=""
            />
          )}

          {/* Only during the days a new calendar month has started but this
              week is still funded by the last one. */}
          {isCurrent && <BoundaryNotice weekStartsOn={weekStart} />}

          {/* Carried-over money used to be explained by a note here too. It now
              lives as an entry in the ledger below, next to the spending it sits
              among, which is where "why did this week start short?" is actually
              asked. Saying the same sentence twice on one screen read as
              clutter, and the ledger version also covers past weeks. */}

          {/* Why this week's allowance isn't the planned figure. It lives here
              rather than in Setup because it explains THIS week's number, and
              this is the screen that spends against it. */}
          {isCurrent && budget.billVariance !== 0 && (
            <View
              style={[
                styles.varianceNote,
                budget.billVariance > 0 ? styles.varianceOver : styles.varianceUnder,
              ]}>
              <ThemedText
                type="small"
                style={budget.billVariance > 0 ? styles.overageText : styles.freeText}>
                Bills came in {fmt(Math.abs(budget.billVariance))}{' '}
                {budget.billVariance > 0 ? 'over' : 'under'} their estimate. Spread across the{' '}
                {weeksLeft} week{weeksLeft === 1 ? '' : 's'} left, this week is {fmt(allowance)}{' '}
                instead of {fmt(budget.weeklyAllowance)}.
              </ThemedText>
            </View>
          )}

          {/* Day-of-week tracker with week navigation */}
          <View style={styles.trackerRow}>
            <NavArrow dir="left" onPress={() => setOffset(offset - 1)} disabled={false} />
            <View style={styles.tracker}>
              {week.days.map((d) => (
                <View key={d.date} style={styles.dayCol}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {d.short}
                  </ThemedText>
                  <View
                    style={[
                      styles.dayDot,
                      d.isToday && styles.dayToday,
                      d.isPast && !d.isToday && styles.dayPast,
                    ]}>
                    <ThemedText
                      type="small"
                      style={d.isToday ? styles.dayTodayText : undefined}
                      themeColor={d.isToday ? undefined : d.isPast ? 'textSecondary' : 'textSecondary'}>
                      {d.dayNum}
                    </ThemedText>
                  </View>
                </View>
              ))}
            </View>
            <NavArrow dir="right" onPress={() => setOffset(offset + 1)} disabled={isCurrent} />
          </View>
          {!isCurrent && (
            <View style={styles.pastWeekNote}>
              <ThemedText type="bodyBold" themeColor="textSecondary">
                A finished week · read only
              </ThemedText>
              {/* Says out loud that history is fixed. Before this the screen
                  quietly recalculated old weeks from today's income, so a pay
                  rise changed what a week that had already ended was worth. */}
              {estimatingPastWeek ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.pastWeekBody}>
                  Nothing was saved for this week, so the {fmt(allowance)} below is worked out
                  from your income and bills as they are today. It may not be what the week
                  really ran on.
                </ThemedText>
              ) : Math.abs(allowance - liveAllowance) >= 0.01 ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.pastWeekBody}>
                  This week ran on {fmt(allowance)} a week. You&apos;re on {fmt(liveAllowance)} now.
                  Changing your income or bills only affects weeks still to come, so a week
                  that has already finished keeps the figure it actually had.
                </ThemedText>
              ) : (
                <ThemedText type="small" themeColor="textSecondary" style={styles.pastWeekBody}>
                  This week ran on {fmt(allowance)} a week, and that&apos;s saved. Later changes
                  to your income or bills won&apos;t change it.
                </ThemedText>
              )}
            </View>
          )}

          {/* Planned spending (envelopes) — current week. Always shown so a
              household can set envelopes up here; free-to-spend is the last row. */}
          {isCurrent && (
            <>
              <SectionHeader
                title="Planned this week"
                action={envSummary.reserved > 0 ? `${fmt(envSummary.reserved)} still to come` : undefined}
                caption={
                  envSummary.hasEnvelopes
                    ? "Set aside first. Spending here doesn't touch your free money unless you go over."
                    : undefined
                }
              />
              {envSummary.hasEnvelopes && (
                <Card style={styles.allowCard}>
                  <View style={styles.allowBar}>
                    {/* Planned pot: a fixed-width block that FILLS as it's spent. */}
                    {pots.plannedUsed > 0 && (
                      <View style={[styles.allowSeg, { flex: pots.plannedUsed, backgroundColor: Palette.sandDeep }]} />
                    )}
                    {pots.plannedLeft > 0 && (
                      <View style={[styles.allowSeg, { flex: pots.plannedLeft, backgroundColor: 'rgba(242,204,143,0.5)' }]} />
                    )}
                    {/* Free pot: the spill sits first, right against the planned
                        block it came from, so the hand-off is visible. */}
                    {pots.overage > 0 && (
                      <View style={[styles.allowSeg, { flex: pots.overage, backgroundColor: Palette.terracotta }]} />
                    )}
                    {pots.otherSpent > 0 && (
                      <View style={[styles.allowSeg, { flex: pots.otherSpent, backgroundColor: '#B8B29B' }]} />
                    )}
                    {pots.freeLeft > 0 && (
                      <View style={[styles.allowSeg, { flex: pots.freeLeft, backgroundColor: Palette.sage }]} />
                    )}
                  </View>

                  {/* Brackets tie the segments above into the two pots. Without
                      them the bar is just five stripes again. */}
                  <View style={styles.bracketRow}>
                    {pots.plannedPot > 0 && <View style={[styles.bracket, { flex: pots.plannedPot }]} />}
                    {pots.freePot > 0 && <View style={[styles.bracket, { flex: pots.freePot }]} />}
                  </View>
                  {/* Left/right aligned rather than flexed to the pot widths:
                      a household with one small envelope would otherwise
                      squeeze a label into a sliver of the row. */}
                  <View style={styles.potRow}>
                    {pots.plannedPot > 0 && (
                      <View>
                        <ThemedText type="small">
                          Planned <ThemedText type="bodyBold">{fmt(pots.plannedPot)}</ThemedText>
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {fmt(pots.plannedUsed)} used
                        </ThemedText>
                      </View>
                    )}
                    {/* Also shown when the pot itself is empty but free has gone
                        negative (envelopes budgeted past the allowance) — that's
                        precisely when the number needs saying. */}
                    {(pots.freePot > 0 || envFree < 0) && (
                      <View style={styles.potCellRight}>
                        <ThemedText type="small">
                          Free{' '}
                          <ThemedText type="bodyBold" style={envFree < 0 ? styles.overageText : undefined}>
                            {envFree < 0 ? '-' + fmt(-envFree) : fmt(envFree)}
                          </ThemedText>
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {fmt(pots.overage + pots.otherSpent)} used
                        </ThemedText>
                      </View>
                    )}
                  </View>
                </Card>
              )}
              {envSummary.envelopes.map((env) => (
                <EnvelopeRow
                  key={env.id}
                  env={env}
                  householdOver={envFree < 0}
                  onPress={() => setEnvSheet({ envelope: rawEnvelope(env.id) })}
                  onSkipToggle={() => toggleSkip(env)}
                />
              ))}

              {/* Where an envelope's overspend went. computeEnvelopes has
                  already taken it out of free-to-spend; without this row that
                  deduction is invisible and free just looks wrong. */}
              {envSummary.overage > 0 && (
                <View style={styles.overageRow}>
                  <View style={styles.freeTile}>
                    <TrendingDown size={24} color={Palette.terracottaDeep} />
                  </View>
                  <View style={styles.flex}>
                    <ThemedText type="bodyBold" style={styles.overageText}>
                      Over on planned
                    </ThemedText>
                    <ThemedText type="small" style={styles.overageSub}>
                      {overageDetail} · comes out of free to spend
                    </ThemedText>
                  </View>
                  <ThemedText type="bodyBold" style={styles.overageText}>
                    -{fmt(envSummary.overage)}
                  </ThemedText>
                </View>
              )}

              {/* Free-to-spend — everything not wrapped in an envelope. */}
              <View style={styles.freeRow}>
                <View style={styles.freeTile}>
                  <IconFreeToSpend width={26} height={26} color={Palette.sageDeep} />
                </View>
                <View style={styles.flex}>
                  <ThemedText type="bodyBold" style={styles.freeText}>
                    Free to spend
                  </ThemedText>
                  <ThemedText type="small" style={styles.freeSub}>
                    {envSummary.hasEnvelopes ? 'Everything not planned' : 'Set up planned costs to reserve some'}
                  </ThemedText>
                </View>
                <ThemedText type="bodyBold" style={styles.freeText}>
                  {envFree < 0 ? '-' + fmt(-envFree) : fmt(envFree)}
                </ThemedText>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add a planned category"
                onPress={() => setEnvSheet({ envelope: null })}
                style={styles.addExpense}>
                <View style={styles.addBadge}>
                  <Plus size={16} color={Palette.card} strokeWidth={3} />
                </View>
                <ThemedText type="label">Add a planned category</ThemedText>
              </Pressable>
            </>
          )}

          {/* Fun money per person (current week only) */}
          {funEnabled && isCurrent && (funPeople.data ?? []).length > 0 && (
            <>
              <SectionHeader
                title="Fun money"
                action={monthName}
                caption="Each person's own money for the whole month. It sits outside the weekly figures above."
              />
              <View style={styles.funRow}>
                {(funPeople.data ?? []).map((p) => {
                  const funSpent = funMoneyUsed({
                    transactions: transactions.data ?? [],
                    memberId: p.member_id,
                    monthKey: funMonthKey,
                  });
                  const rem = Math.round((p.monthly_amount - funSpent) * 100) / 100;
                  const pOver = rem < 0;
                  const pFrac = pOver ? 1 : p.monthly_amount > 0 ? Math.max(0, Math.min(1, rem / p.monthly_amount)) : 0;
                  return (
                    <View key={p.id} style={styles.funCard}>
                      <Ring value={pFrac} size={52} stroke={6} color={pOver ? Palette.terracotta : Palette.sand} track="#F0E9D6">
                        <ThemedText type="small" style={pOver ? { color: Palette.terracottaDeep } : undefined}>
                          {fmt(rem)}
                        </ThemedText>
                      </Ring>
                      <View style={styles.funText}>
                        <ThemedText type="bodyBold" numberOfLines={1}>
                          {memberName(p.member_id)}
                        </ThemedText>
                        <ThemedText type="small" style={{ color: Palette.sandDeep }}>
                          {fmt(funSpent)} of {fmt(p.monthly_amount)} used
                        </ThemedText>
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {/* Ledger grouped by day */}
          <SectionHeader
            title="Weekly spending"
            action={weekTxns.length ? `${weekTxns.length} logged` : undefined}
          />
          {isCurrent && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add an expense"
              onPress={() => router.push('/add-expense')}
              style={styles.addExpense}>
              <View style={styles.addBadge}>
                <Plus size={16} color={Palette.card} strokeWidth={3} />
              </View>
              <ThemedText type="label">Add an expense</ThemedText>
            </Pressable>
          )}
          {/* The week's opening position, shown wherever money went.

              Deliberately NOT a transaction. The amount is already applied to
              the allowance above, so writing it into the ledger as a real row
              would deduct it a second time and make the week look twice as bad
              as it is. Hence the dashed outline and no tap target: it reads as
              context, not as something logged. */}
          {adjustment !== 0 && (
            <View style={styles.carryRow}>
              <View style={styles.carryTile}>
                <CornerDownRight
                  size={20}
                  color={adjustment < 0 ? Palette.terracottaDeep : Palette.sageDeep}
                />
              </View>
              <View style={styles.flex}>
                <ThemedText type="bodyBold">
                  {adjustment < 0 ? 'Started short from last week' : 'Started ahead from last week'}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.carrySub}>
                  {adjustment < 0
                    ? `You went over last week and chose to carry it in, so this week began with ${fmt(-adjustment)} less to spend.`
                    : `You had money left last week and chose to carry it in, so this week began with ${fmt(adjustment)} more to spend.`}
                </ThemedText>
              </View>
              <ThemedText
                type="bodyBold"
                style={adjustment < 0 ? styles.overageText : styles.freeText}>
                {adjustment < 0 ? '-' : '+'}
                {fmt(Math.abs(adjustment))}
              </ThemedText>
            </View>
          )}

          {dayGroups.length ? (
            dayGroups.map((g) => (
              <View key={g.date}>
                <ThemedText type="label" themeColor="textSecondary" style={styles.dayHeading}>
                  {g.heading}
                </ThemedText>
                {g.items.map((t) => {
                  const cat = txCategoryById(t.category);
                  const isIncome = t.type === 'income';
                  return (
                    <ListRow
                      key={t.id}
                      emoji={
                        isIncome ? (
                          <IconGiftBox width={22} height={22} color={Palette.sageDeep} />
                        ) : (
                          <CategoryGlyph txId={cat.id} emoji={cat.emoji} />
                        )
                      }
                      title={t.label ?? cat.name}
                      subtitle={`${isIncome ? 'Money back' : cat.name} · ${memberName(t.member_id)}`}
                      badge={
                        t.is_fun_money ? (
                          <View style={styles.funBadge}>
                            <ThemedText type="small" style={styles.funBadgeText}>
                              🎉 Fun
                            </ThemedText>
                          </View>
                        ) : undefined
                      }
                      onPress={isCurrent ? () => router.push(`/add-expense?id=${t.id}`) : undefined}
                      right={
                        <ThemedText
                          type="bodyBold"
                          style={{ color: isIncome ? Palette.sageDeep : Palette.terracottaDeep }}>
                          {isIncome ? '+' : '-'}
                          {fmt(t.amount)}
                        </ThemedText>
                      }
                    />
                  );
                })}
              </View>
            ))
          ) : (
            <Card style={styles.empty}>
              <IconBills width={26} height={26} color={Palette.ink} />
              <ThemedText type="body" themeColor="textSecondary" style={styles.emptyText}>
                Nothing logged for this week yet.
              </ThemedText>
              {isCurrent && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Add your first expense"
                  onPress={() => router.push('/add-expense')}>
                  <ThemedText type="label" style={{ color: Palette.sageDeep }}>
                    Add first expense
                  </ThemedText>
                </Pressable>
              )}
            </Card>
          )}
        </>
      )}

      <EnvelopeSheet
        visible={!!envSheet}
        envelope={envSheet?.envelope ?? null}
        usedCategories={usedCategories}
        onClose={() => setEnvSheet(null)}
        onSave={saveEnvelope}
        onDelete={removeEnvelope}
        saving={envMut.add.isPending || envMut.update.isPending}
      />
      <RolloverPrompt
        visible={showRolloverPrompt}
        amount={lastRemaining}
        allowance={lastPlannedWeekly}
        spent={lastSpent}
        incomeBack={lastIncomeBack}
        carriedIn={lastAdjustment}
        catchUpOwing={catchUpBalance(catchUp.data)}
        goals={goals.data ?? []}
        loading={settleRollover.isPending}
        onResolve={resolveRollover}
      />
    </Screen>
  );
}

function NavArrow({ dir, onPress, disabled }: { dir: 'left' | 'right'; onPress: () => void; disabled: boolean }) {
  const Icon = dir === 'left' ? ChevronLeft : ChevronRight;
  // Both boxes stay identical; a disabled arrow just dims its chevron.
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={dir === 'left' ? 'Previous week' : 'Next week'}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={styles.navArrow}>
      <Icon size={18} color={disabled ? 'rgba(61,64,91,0.28)' : Palette.ink} />
    </Pressable>
  );
}

function EnvelopeRow({
  env,
  householdOver,
  onPress,
  onSkipToggle,
}: {
  env: EnvelopeStatus;
  // The household's OVERALL free-to-spend has gone negative. An envelope that
  // hasn't individually gone over its own budget still has "room left" on
  // paper — but that room isn't really free money once the household as a
  // whole is spent past what it has, so don't paint it green/reassuring here.
  householdOver: boolean;
  onPress: () => void;
  onSkipToggle: () => void;
}) {
  const cat = txCategoryById(env.category);
  const frac = env.budget > 0 ? Math.max(0, Math.min(1, env.spent / env.budget)) : 0;
  const atRisk = householdOver && (env.state === 'on-track' || env.state === 'untouched');
  const barColor =
    env.state === 'over' ? Palette.terracotta : env.state === 'skipped' ? '#C7C4B8' : atRisk ? Palette.sand : Palette.sage;

  let subtitle: string;
  let rightText: string;
  let rightColor: string | undefined;
  if (env.state === 'skipped') {
    subtitle = 'Skipped this week';
    rightText = '—';
  } else if (env.state === 'untouched') {
    subtitle = atRisk ? 'Not spent yet · household is over budget' : 'Not spent yet · still to come';
    rightText = `${fmt(env.remaining)} left`;
    rightColor = atRisk ? Palette.sandDeep : undefined;
  } else if (env.state === 'over') {
    subtitle = `${fmt(env.spent)} of ${fmt(env.budget)}`;
    rightText = `${fmt(env.over)} over`;
    rightColor = Palette.terracottaDeep;
  } else {
    subtitle = atRisk
      ? `${fmt(env.spent)} of ${fmt(env.budget)} · household is over budget`
      : `${fmt(env.spent)} of ${fmt(env.budget)}`;
    rightText = `${fmt(env.remaining)} left`;
    rightColor = atRisk ? Palette.sandDeep : undefined;
  }

  return (
    <ListRow
      emoji={<CategoryGlyph txId={cat.id} emoji={cat.emoji} />}
      title={cat.name}
      subtitle={subtitle}
      dim={env.state === 'skipped'}
      onPress={onPress}
      right={
        <ThemedText type="bodyBold" style={rightColor ? { color: rightColor } : undefined}>
          {rightText}
        </ThemedText>
      }
      footer={
        <View style={styles.envFooter}>
          <View style={styles.envTrack}>
            <View style={[styles.envFill, { width: `${frac * 100}%`, backgroundColor: barColor }]} />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              env.skipped ? `Stop skipping ${cat.name} this week` : `Skip ${cat.name} this week`
            }
            onPress={onSkipToggle}
            hitSlop={8}
            style={styles.skipBtn}>
            <ThemedText type="small" themeColor="textSecondary">
              {env.skipped ? 'Skipped · Undo' : 'Skip this week'}
            </ThemedText>
          </Pressable>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: Spacing.six },
  flex: { flex: 1 },
  trackerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.three },
  navArrow: {
    width: 40,
    height: 40,
    borderRadius: Radius.medium,
    backgroundColor: Palette.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tracker: { flex: 1, flexDirection: 'row', paddingVertical: Spacing.two, paddingHorizontal: Spacing.one },
  dayCol: { flex: 1, alignItems: 'center', gap: Spacing.one },
  dayDot: {
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayToday: { backgroundColor: Palette.sage },
  dayTodayText: { color: Palette.card },
  dayPast: { backgroundColor: 'rgba(61,64,91,0.08)' },
  pastWeekNote: {
    backgroundColor: 'rgba(61,64,91,0.05)',
    borderRadius: Radius.large,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    marginTop: Spacing.two,
    gap: 2,
  },
  pastWeekBody: { lineHeight: 19 },
  // Dashed and untappable, so it reads as context rather than as a logged
  // entry sitting among real ones.
  carryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(61,64,91,0.22)',
    borderRadius: Radius.large,
    padding: Spacing.three,
    marginBottom: Spacing.two + 2,
  },
  carryTile: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  carrySub: { lineHeight: 18 },
  allowCard: { marginBottom: Spacing.three, gap: Spacing.two + 2 },
  allowBar: {
    flexDirection: 'row',
    height: 12,
    borderRadius: Radius.pill,
    overflow: 'hidden',
    backgroundColor: 'rgba(61,64,91,0.06)',
  },
  allowSeg: { height: '100%' },
  // Aligned to the bar above with no gap, so each bracket sits exactly under
  // the segments it groups.
  bracketRow: { flexDirection: 'row', height: 7, marginTop: 5 },
  bracket: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(61,64,91,0.2)',
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  potRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.three,
    marginTop: Spacing.one,
  },
  potCellRight: { alignItems: 'flex-end' },
  envFooter: { marginTop: Spacing.two + 2, gap: Spacing.two },
  envTrack: {
    height: 8,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(61,64,91,0.06)',
    overflow: 'hidden',
  },
  envFill: { height: '100%', borderRadius: Radius.pill },
  skipBtn: { alignSelf: 'flex-start' },
  freeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: 'rgba(129,178,154,0.16)',
    borderRadius: Radius.large,
    padding: Spacing.three,
    marginBottom: Spacing.two + 2,
  },
  freeTile: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  freeText: { color: Palette.sageDeep },
  freeSub: { color: 'rgba(94,143,119,0.85)' },
  overageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: 'rgba(224,122,95,0.14)',
    borderRadius: Radius.large,
    padding: Spacing.three,
    marginBottom: Spacing.two + 2,
  },
  overageText: { color: Palette.terracottaDeep },
  overageSub: { color: 'rgba(194,90,64,0.85)' },
  varianceNote: {
    borderRadius: Radius.large,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    marginTop: Spacing.three,
  },
  varianceUnder: { backgroundColor: 'rgba(129,178,154,0.16)' },
  varianceOver: { backgroundColor: 'rgba(224,122,95,0.14)' },
  funRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  funCard: {
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 150,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: 'rgba(242,204,143,0.22)',
    borderWidth: 1,
    borderColor: Palette.sand,
    borderRadius: Radius.large,
    padding: Spacing.two + 2,
  },
  funText: { flex: 1, minWidth: 0 },
  dayHeading: { marginTop: Spacing.two, marginBottom: Spacing.two, marginLeft: Spacing.one },
  addExpense: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(61,64,91,0.25)',
    borderRadius: Radius.large,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.three,
  },
  addBadge: {
    width: 26,
    height: 26,
    borderRadius: Radius.pill,
    backgroundColor: Palette.sageDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  funBadge: {
    backgroundColor: 'rgba(242,204,143,0.4)',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
  },
  funBadgeText: { color: Palette.sandDeep },
  empty: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five, marginTop: Spacing.two },
  emptyText: { textAlign: 'center' },
});
