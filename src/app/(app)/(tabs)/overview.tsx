import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { BarChart, type Bar } from '@/components/bar-chart';
import { Card } from '@/components/card';
import { CategoryGlyph } from '@/components/category-glyph';
import { DeltaText } from '@/components/delta-text';
import { Donut } from '@/components/donut';
import { MonthReviewBanner } from '@/components/month-review-banner';
import { MoneyRow } from '@/components/money-row';
import { LoadError } from '@/components/load-error';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SectionHeader } from '@/components/section-header';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { txCategoryById } from '@/lib/categories';
import { useHousehold } from '@/lib/household';
import { InfoSheet, InfoTap } from '@/components/info-sheet';
import { WEEKLY_PERIODS_INFO } from '@/components/weekly-periods-notice';
import {
  FREQ,
  adjustedWeeklyAllowance,
  computeBudget,
  fmt,
  isVariableExpense,
  monthlyEquiv,
} from '@/lib/money';
import { periodFor, periodRangeLabel, weeksInPeriod, weeksRemainingInPeriod } from '@/lib/period';
import { buildMonthComparison, monthBefore, monthLabel, monthStartISO } from '@/lib/month-review';
import {
  useBills,
  useExtraIncome,
  useFunPeople,
  useFunSettings,
  useGoals,
  useIncome,
  useMembers,
  useMonthSnapshots,
  useTransactions,
} from '@/lib/queries';

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function OverviewScreen() {
  const { householdId, household } = useHousehold();
  const members = useMembers(householdId);
  const income = useIncome(householdId);
  const extraIncome = useExtraIncome(householdId);
  const bills = useBills(householdId);
  const goals = useGoals(householdId);
  const funPeople = useFunPeople(householdId);
  const funSettings = useFunSettings(householdId);
  const transactions = useTransactions(householdId);
  const snapshots = useMonthSnapshots(householdId);

  const [range, setRange] = useState<'3' | '6' | '9' | '12'>('3');
  const [monthOffset, setMonthOffset] = useState(0); // 0 = current month, -1 = last, …
  const [cadenceInfo, setCadenceInfo] = useState(false);
  const [weeklyInfo, setWeeklyInfo] = useState(false);

  const todayLabel = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const isCurrentMonth = monthOffset === 0;
  const viewedMonth = useMemo(() => {
    const now = new Date();
    return monthStartISO(new Date(now.getFullYear(), now.getMonth() + monthOffset, 1));
  }, [monthOffset]);
  const viewedMonthName = monthLabel(viewedMonth).split(' ')[0];

  const funEnabled = funSettings.data?.enabled ?? false;
  const weekStartDay = household?.week_start_day ?? 0;
  // Paycheck cadences don't divide evenly into months (26 or 52 a year), so
  // their monthly figure is an average. Monthly and twice-a-month do divide
  // evenly, so those households never need the explanation.
  const hasPaycheckCadence = (income.data ?? []).some(
    (s) => s.frequency === 'biweekly' || s.frequency === 'weekly'
  );
  const budget = computeBudget({
    incomeSources: income.data ?? [],
    extraIncome: extraIncome.data ?? [],
    bills: bills.data ?? [],
    goals: goals.data ?? [],
    funMoneyEnabled: funEnabled,
    funPeople: funPeople.data ?? [],
    weeksInPeriod: weeksInPeriod(monthStartISO(new Date()), weekStartDay),
  });

  const memberName = (id: string | null) =>
    (members.data ?? []).find((m) => m.id === id)?.name ?? 'Household';

  const viewedSnapshot = (snapshots.data ?? []).find((s) => s.month === viewedMonth);
  const prevSnapshot = (snapshots.data ?? []).find((s) => s.month === monthBefore(viewedMonth));
  const goalsSavedNow = (goals.data ?? []).reduce((a, g) => a + g.saved_amount, 0);

  // Current month always uses live settings (today's plan). A past month only
  // has plan figures if it was closed — bills/income aren't tracked
  // historically otherwise, so we show what we DO have rather than guess.
  const glance = isCurrentMonth
    ? {
        totalIncome: budget.totalIncome,
        totalFixed: budget.totalFixed,
        goalsMonthly: budget.goalsMonthly,
        funTotal: budget.funTotal,
        weeklyAllowance: budget.weeklyAllowance,
        monthlyPool: budget.monthlyPool,
        weeks: budget.weeksInPeriod,
        variablePool: budget.variablePool,
        goalsSaved: goalsSavedNow,
        fixedPct: budget.fixedPct,
      }
    : viewedSnapshot
      ? {
          totalIncome: viewedSnapshot.total_income,
          totalFixed: viewedSnapshot.total_fixed,
          goalsMonthly: viewedSnapshot.goals_monthly,
          funTotal: viewedSnapshot.fun_total,
          weeklyAllowance: viewedSnapshot.weekly_allowance,
          monthlyPool: viewedSnapshot.weekly_allowance * weeksInPeriod(viewedMonth, weekStartDay),
          weeks: weeksInPeriod(viewedMonth, weekStartDay),
          variablePool: viewedSnapshot.total_income - viewedSnapshot.total_fixed,
          goalsSaved: viewedSnapshot.goals_saved_total,
          fixedPct:
            viewedSnapshot.total_income > 0
              ? Math.round((viewedSnapshot.total_fixed / viewedSnapshot.total_income) * 100)
              : 0,
        }
      : null;

  // Bill variance only exists for the live plan: a closed month's snapshot
  // records what it was budgeted at, not what came in afterwards.
  const weeksLeft = weeksRemainingInPeriod(weekStartDay);
  const adjustedWeekly = adjustedWeeklyAllowance({
    plannedWeekly: budget.weeklyAllowance,
    billVariance: budget.billVariance,
    weeksRemaining: weeksLeft,
  });

  /**
   * What the variable pool has left after the three planned allocations.
   *
   * It reduces to plannedFixed − totalFixed every time, because the pool is
   * measured against what bills actually cost while the allowance is derived
   * from the estimates. Non-zero means the breakdown wouldn't sum on screen,
   * so it gets its own row rather than being left as an unexplained gap.
   */
  const unallocated = glance
    ? Math.round((glance.variablePool - glance.monthlyPool - glance.goalsMonthly - glance.funTotal) * 100) / 100
    : 0;

  const comparison =
    glance && prevSnapshot
      ? buildMonthComparison({
          month: viewedMonth,
          weekStartsOn: weekStartDay,
          now: {
            weeklyAllowance: glance.weeklyAllowance,
            totalIncome: glance.totalIncome,
            totalFixed: glance.totalFixed,
            goalsSaved: glance.goalsSaved,
          },
          prev: {
            weeklyAllowance: prevSnapshot.weekly_allowance,
            totalIncome: prevSnapshot.total_income,
            totalFixed: prevSnapshot.total_fixed,
            goalsSaved: prevSnapshot.goals_saved_total,
          },
        })
      : null;

  /**
   * The ring is a picture of how income is allocated, so its bills slice is
   * what the plan SET ASIDE for bills, which is income less the other three
   * allocations by construction. The rows below carry what bills actually
   * cost, and the "bills came in under/over" row explains the difference.
   *
   * Using the actual figure here instead left the ring totalling $8,494 while
   * its own centre read $8,504. Donut normalises to the sum of its segments,
   * so the ring still drew as a complete circle and the gap was invisible.
   * Deriving the slice this way makes it exact for live and closed months
   * alike, with no fifth slice and no edge case when bills run over.
   */
  const plannedForBills = glance
    ? Math.max(0, Math.round((glance.totalIncome - glance.monthlyPool - glance.goalsMonthly - glance.funTotal) * 100) / 100)
    : 0;

  const pie = glance
    ? [
        { name: 'Fixed expenses', value: plannedForBills, color: Palette.ink },
        { name: 'Weekly allowance', value: glance.monthlyPool, color: Palette.sage },
        { name: 'Savings goals', value: glance.goalsMonthly, color: Palette.terracotta },
        { name: 'Fun money', value: glance.funTotal, color: Palette.sandDeep },
      ].filter((d) => d.value > 0)
    : [];

  // Category breakdown of variable spending for the VIEWED month — always live
  // from transactions (real dates, never reset), so this works for any month.
  const viewedMonthKey = viewedMonth.slice(0, 7);
  const catTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    (transactions.data ?? []).forEach((t) => {
      if (isVariableExpense(t) && t.occurred_on.startsWith(viewedMonthKey)) {
        totals[t.category ?? 'other'] = (totals[t.category ?? 'other'] ?? 0) + t.amount;
      }
    });
    return Object.entries(totals)
      .map(([id, value]) => ({ ...txCategoryById(id), value }))
      .sort((a, b) => b.value - a.value);
  }, [transactions.data, viewedMonthKey]);
  const catGrand = catTotals.reduce((a, c) => a + c.value, 0);

  // Real monthly variable-spend totals for the trend (fills in as history grows).
  const trend: Bar[] = useMemo(() => {
    const n = Number(range);
    const byMonth: Record<string, number> = {};
    (transactions.data ?? []).forEach((t) => {
      if (!isVariableExpense(t)) return;
      const key = t.occurred_on.slice(0, 7);
      byMonth[key] = (byMonth[key] ?? 0) + t.amount;
    });
    const out: Bar[] = [];
    const now = new Date();
    // 12-month view is cramped, so use single-letter month initials there;
    // shorter ranges have room for the 3-letter abbreviation.
    const monthStyle = n >= 12 ? 'narrow' : 'short';
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push({ label: d.toLocaleDateString('en-US', { month: monthStyle }), value: byMonth[monthKey(d)] ?? 0 });
    }
    return out;
  }, [transactions.data, range]);

  const loading = !householdId || income.isLoading || transactions.isLoading || snapshots.isLoading;
  const loadFailed = income.isError || transactions.isError || snapshots.isError || bills.isError;
  const retryLoad = () => {
    income.refetch();
    transactions.refetch();
    snapshots.refetch();
    bills.refetch();
  };

  return (
    <Screen>
      <ScreenHeader eyebrow={todayLabel} title="Overview" />
      <MonthReviewBanner />

      {loading ? (
        <ActivityIndicator color={Palette.sageDeep} style={styles.loading} />
      ) : loadFailed ? (
        <LoadError onRetry={retryLoad} what="your overview" />
      ) : (
        <>
          {/* Month at a glance */}
          <View style={styles.glanceHeader}>
            <ThemedText type="subtitle">Month at a glance</ThemedText>
            <View style={styles.pager}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous month"
                onPress={() => setMonthOffset((o) => o - 1)}
                style={styles.pagerBtn}>
                <ChevronLeft size={16} color={Palette.ink} />
              </Pressable>
              <ThemedText type="label" style={styles.pagerLabel}>
                {viewedMonthName}
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next month"
                disabled={isCurrentMonth}
                onPress={() => setMonthOffset((o) => o + 1)}
                style={styles.pagerBtn}>
                <ChevronRight size={16} color={isCurrentMonth ? 'rgba(61,64,91,0.28)' : Palette.ink} />
              </Pressable>
            </View>
          </View>

          {glance ? (
            <Card style={styles.glanceCard}>
              {pie.length > 0 && (
                <View style={styles.donutWrap}>
                  <Donut segments={pie}>
                    <ThemedText type="small" themeColor="textSecondary">
                      INCOME
                    </ThemedText>
                    <ThemedText type="subtitle">{fmt(glance.totalIncome)}</ThemedText>
                  </Donut>
                </View>
              )}

              {/* Deliberately NOT green. Green belongs to the weekly-allowance
                  slice of the ring above, and a green total sitting beside a
                  green arc taught people to read the arc as this number. */}
              <MoneyRow label="Total income" value={fmt(glance.totalIncome)} strong />
              {isCurrentMonth &&
                (income.data ?? []).map((s) => (
                  <MoneyRow
                    key={s.id}
                    label={`${memberName(s.member_id)} · ${FREQ[s.frequency].label}`}
                    value={fmt(monthlyEquiv(s))}
                    sub
                  />
                ))}
              {isCurrentMonth &&
                (extraIncome.data ?? []).map((x) => (
                  <MoneyRow key={x.id} label={`+ ${x.source}`} value={fmt(x.amount)} sub />
                ))}

              {/* Only for households that actually have paycheck-cadence
                  income, where the monthly figure is an average rather than
                  what lands in the account. */}
              {isCurrentMonth && hasPaycheckCadence && (
                <View style={styles.noteRow}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
                    Shown as a monthly average
                  </ThemedText>
                  <InfoTap
                    label="How every 2 week income averages out"
                    onPress={() => setCadenceInfo(true)}
                  />
                </View>
              )}

              <View style={styles.divider} />
              <MoneyRow label="Fixed expenses" value={`−${fmt(glance.totalFixed)}`} strong color={Palette.terracottaDeep} dot={Palette.ink} />
              {glance.fixedPct != null && (
                <ThemedText type="small" themeColor="textSecondary" style={styles.rowNote}>
                  {glance.fixedPct}% of your monthly income, off the top before anything else
                </ThemedText>
              )}
              <View style={styles.divider} />
              {/* Same reason. This was THE misleading one: a green $1,969 sat
                  directly above a green arc worth $1,909, so the arc read as
                  the variable pool when it's the weekly allowance. */}
              <MoneyRow label="Variable pool" value={fmt(glance.variablePool)} strong />
              <ThemedText type="small" themeColor="textSecondary" style={styles.rowNote}>
                What&apos;s left after bills. The three below come out of it.
              </ThemedText>
              <MoneyRow
                label={`Weekly allowance · ${fmt(glance.weeklyAllowance)}/wk ×${glance.weeks}`}
                value={`−${fmt(glance.monthlyPool)}`}
                sub
                color={Palette.terracottaDeep}
                dot={Palette.sage}
              />
              <View style={styles.noteRow}>
                <ThemedText type="small" themeColor="textSecondary" style={[styles.flex, styles.rowNote]}>
                  {glance.weeks} weeks, {periodRangeLabel(periodFor(viewedMonth, weekStartDay))}
                </ThemedText>
                <InfoTap label="How your weekly amount works" onPress={() => setWeeklyInfo(true)} />
              </View>
              <MoneyRow label="Savings goals" value={`−${fmt(glance.goalsMonthly)}`} sub color={Palette.terracottaDeep} dot={Palette.terracotta} />
              <MoneyRow label="Fun money" value={`−${fmt(glance.funTotal)}`} sub color={Palette.terracottaDeep} dot={Palette.sandDeep} />
              {/* Closes the column. The pool is measured against what bills
                  ACTUALLY cost while the allowance is derived from the
                  estimates, so when the two differ this much is left sitting
                  outside the plan. Without the row the numbers above simply
                  don't add up, which is worse than the gap itself. */}
              {unallocated !== 0 && (
                <>
                  <MoneyRow
                    label={`Bills came in ${unallocated > 0 ? 'under' : 'over'}`}
                    value={`${unallocated > 0 ? '+' : '−'}${fmt(Math.abs(unallocated))}`}
                    sub
                    color={unallocated > 0 ? Palette.sageDeep : Palette.terracottaDeep}
                  />
                  {isCurrentMonth && (
                    <ThemedText type="small" themeColor="textSecondary" style={styles.rowNote}>
                      Spread across the {weeksLeft} week{weeksLeft === 1 ? '' : 's'} left, so this
                      week is {fmt(adjustedWeekly)}
                    </ThemedText>
                  )}
                </>
              )}
            </Card>
          ) : (
            <Card style={styles.noSnapshotCard}>
              <ThemedText type="body" themeColor="textSecondary" style={styles.noSnapshotText}>
                No budget snapshot recorded for {viewedMonthName} — this was before monthly tracking
                started.
              </ThemedText>
            </Card>
          )}

          {glance && comparison && (
            <Card style={styles.insightsCard}>
              <ThemedText type="label" themeColor="textSecondary" style={styles.insightsLabel}>
                COMPARED WITH {comparison.prevName.toUpperCase()}
              </ThemedText>

              {/* Both figures, always. Showing only the weekly one let a month
                  with fewer weeks read as a raise: the same (or smaller) pool
                  divided four ways instead of five looks like more money until
                  you see the monthly total fall next to it. */}
              <CompareRow
                label="Per week"
                value={fmt(glance.weeklyAllowance)}
                delta={comparison.weeklyDelta}
              />
              <CompareRow
                label="For the month"
                value={fmt(glance.monthlyPool)}
                delta={comparison.poolDelta}
                divider
              />

              {comparison.weeksChanged && (
                <View style={styles.weeksNote}>
                  <ThemedText type="small" style={styles.weeksNoteText}>
                    {comparison.thisName} splits across {glance.weeks} weeks; {comparison.prevName}{' '}
                    had {comparison.prevWeeks}.{' '}
                    {comparison.opposed
                      ? `That's why the weekly figure went ${comparison.weeklyDelta > 0 ? 'up' : 'down'} even though the month has ${comparison.poolDelta > 0 ? 'more' : 'less'} in it.`
                      : "A month's pool is divided by its own week count, so the weekly figure shifts with it."}
                  </ThemedText>
                </View>
              )}

              <View style={styles.divider} />
              {comparison.changed.map((c) => (
                <CompareRow key={c.label} label={c.label} delta={c.delta} invert={c.invert} />
              ))}
              {comparison.unchangedNote && (
                <ThemedText type="small" themeColor="textSecondary" style={styles.allowanceNote}>
                  {comparison.unchangedNote}
                </ThemedText>
              )}
            </Card>
          )}

          {/* Spending trend */}
          <SectionHeader title="Spending trend" />
          <ThemedText type="small" themeColor="textSecondary" style={styles.trendNote}>
            Total variable spending logged each month. Bills and fun money aren&apos;t counted here.
          </ThemedText>
          <View style={styles.rangeWrap}>
            <Segmented
              value={range}
              onChange={setRange}
              options={[
                { value: '3', label: '3mo' },
                { value: '6', label: '6mo' },
                { value: '9', label: '9mo' },
                { value: '12', label: '1yr' },
              ]}
            />
          </View>
          <Card style={styles.trendCard}>
            <BarChart data={trend} />
          </Card>

          {/* Where the money went */}
          <SectionHeader
            title="Where the money went"
            action={viewedMonthName}
            caption="Variable spending only, the same total as the trend above. Fun money is each person's own and sits outside this."
          />
          <Card>
            {catTotals.length === 0 ? (
              <ThemedText type="body" themeColor="textSecondary" style={styles.emptyCats}>
                Log expenses and the breakdown appears here.
              </ThemedText>
            ) : (
              <>
                <View style={styles.stack}>
                  {catTotals.map((c) => (
                    <View key={c.id} style={{ width: `${(c.value / catGrand) * 100}%`, backgroundColor: c.color }} />
                  ))}
                </View>
                {catTotals.map((c) => (
                  <View key={c.id} style={styles.catRow}>
                    <View style={[styles.catDot, { backgroundColor: c.color }]} />
                    <CategoryGlyph txId={c.id} emoji={c.emoji} size={21} />
                    <ThemedText type="bodyBold" style={styles.catName}>
                      {c.name}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {Math.round((c.value / catGrand) * 100)}%
                    </ThemedText>
                    <ThemedText type="label" style={styles.catValue}>
                      {fmt(c.value)}
                    </ThemedText>
                  </View>
                ))}
              </>
            )}
          </Card>
        </>
      )}

      <InfoSheet
        visible={cadenceInfo}
        title="How every 2 week income averages out"
        paragraphs={[
          'Getting paid every 2 weeks means 26 paychecks a year, which doesn’t divide evenly into 12 months. Most months have 2 paychecks, but twice a year you’ll get 3.',
          'Your income here is the yearly total spread evenly, so your weekly amount stays steady instead of jumping around.',
          'In practice most months land a little under this figure, and those two months land well over. It evens out across the year.',
        ]}
        onClose={() => setCadenceInfo(false)}
      />
      <InfoSheet
        visible={weeklyInfo}
        title={WEEKLY_PERIODS_INFO.title}
        paragraphs={WEEKLY_PERIODS_INFO.paragraphs}
        onClose={() => setWeeklyInfo(false)}
      />
    </Screen>
  );
}

/**
 * One line of the month comparison. `value` makes it a headline figure with
 * its change beside it; without one it's a plain "what moved" row. The change
 * itself is worded by DeltaText, shared with the month review.
 */
function CompareRow({
  label,
  value,
  delta,
  invert,
  divider,
}: {
  label: string;
  value?: string;
  delta: number;
  invert?: boolean;
  divider?: boolean;
}) {
  return (
    <View style={[styles.compareRow, divider && styles.compareDivider]}>
      <ThemedText type="body" style={styles.compareLabel}>
        {label}
      </ThemedText>
      {value && <ThemedText type="subtitle">{value}</ThemedText>}
      <View style={value ? styles.compareDelta : undefined}>
        <DeltaText delta={delta} invert={invert} type={value ? 'body' : 'bodyBold'} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: Spacing.six },
  glanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.four,
    marginBottom: Spacing.three,
    gap: Spacing.two,
  },
  pager: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  pagerBtn: {
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    backgroundColor: Palette.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pagerLabel: { minWidth: 52, textAlign: 'center' },
  glanceCard: { paddingVertical: Spacing.four },
  donutWrap: { alignItems: 'center', marginBottom: Spacing.three },
  flex: { flex: 1 },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(61,64,91,0.15)',
    marginVertical: Spacing.two,
  },
  // Indented to sit under the row it annotates, matching MoneyRow's `sub`.
  rowNote: { paddingLeft: Spacing.three, lineHeight: 18 },
  noSnapshotCard: { paddingVertical: Spacing.five },
  noSnapshotText: { textAlign: 'center' },
  insightsCard: { marginTop: Spacing.three, gap: Spacing.one },
  insightsLabel: { letterSpacing: 0.6, marginBottom: Spacing.one },
  compareRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.one + 1,
  },
  compareDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(61,64,91,0.12)',
    marginTop: 2,
    paddingTop: Spacing.two,
  },
  compareLabel: { flex: 1 },
  // Fixed width so the two headline deltas line up under each other rather
  // than floating at the end of differently-sized figures.
  compareDelta: { minWidth: 96, alignItems: 'flex-end' },
  good: { color: Palette.sageDeep },
  warn: { color: Palette.terracottaDeep },
  weeksNote: {
    backgroundColor: 'rgba(242,204,143,0.28)',
    borderRadius: Radius.medium,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two + 4,
    marginTop: Spacing.two,
  },
  weeksNoteText: { color: '#8A6A2A', lineHeight: 19 },
  allowanceNote: { marginTop: Spacing.one, lineHeight: 18 },
  trendNote: { marginTop: -Spacing.two, marginBottom: Spacing.three, marginLeft: Spacing.one },
  rangeWrap: { marginBottom: Spacing.three },
  trendCard: { paddingVertical: Spacing.three },
  emptyCats: { textAlign: 'center', paddingVertical: Spacing.three },
  stack: { flexDirection: 'row', height: 16, borderRadius: Radius.pill, overflow: 'hidden', marginBottom: Spacing.three },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one + 2 },
  catDot: { width: 10, height: 10, borderRadius: Radius.pill },
  catName: { flex: 1 },
  catValue: { width: 66, textAlign: 'right' },
});
