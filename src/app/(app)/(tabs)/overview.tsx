import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { BarChart, type Bar } from '@/components/bar-chart';
import { Card } from '@/components/card';
import { CategoryGlyph } from '@/components/category-glyph';
import { Donut } from '@/components/donut';
import { MonthReviewBanner } from '@/components/month-review-banner';
import { MoneyRow } from '@/components/money-row';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SectionHeader } from '@/components/section-header';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { txCategoryById } from '@/lib/categories';
import { useHousehold } from '@/lib/household';
import { InfoSheet, InfoTap } from '@/components/info-sheet';
import { FREQ, computeBudget, fmt, monthlyEquiv } from '@/lib/money';
import { weeksInPeriod } from '@/lib/period';
import { monthLabel, monthStartISO } from '@/lib/month-review';
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

/** The 'YYYY-MM-01' one calendar month before `month`. */
function monthBefore(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return monthStartISO(new Date(y, m - 2, 1));
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
        }
      : null;

  const pie = glance
    ? [
        { name: 'Fixed expenses', value: glance.totalFixed, color: Palette.ink },
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
      if (t.type === 'expense' && t.occurred_on.startsWith(viewedMonthKey)) {
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
      if (t.type !== 'expense') return;
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

  return (
    <Screen>
      <ScreenHeader eyebrow={todayLabel} title="Overview" />
      <MonthReviewBanner />

      {loading ? (
        <ActivityIndicator color={Palette.sageDeep} style={styles.loading} />
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

              <MoneyRow label="Total income" value={fmt(glance.totalIncome)} strong color={Palette.sageDeep} />
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
              <View style={styles.divider} />
              <MoneyRow label="Variable pool" value={fmt(glance.variablePool)} strong color={Palette.sageDeep} />
              <MoneyRow
                label={`Weekly allowance · ${fmt(glance.weeklyAllowance)}/wk ×${glance.weeks}`}
                value={`−${fmt(glance.monthlyPool)}`}
                sub
                color={Palette.terracottaDeep}
                dot={Palette.sage}
              />
              <MoneyRow label="Savings goals" value={`−${fmt(glance.goalsMonthly)}`} sub color={Palette.terracottaDeep} dot={Palette.terracotta} />
              <MoneyRow label="Fun money" value={`−${fmt(glance.funTotal)}`} sub color={Palette.terracottaDeep} dot={Palette.sandDeep} />
            </Card>
          ) : (
            <Card style={styles.noSnapshotCard}>
              <ThemedText type="body" themeColor="textSecondary" style={styles.noSnapshotText}>
                No budget snapshot recorded for {viewedMonthName} — this was before monthly tracking
                started.
              </ThemedText>
            </Card>
          )}

          {glance && prevSnapshot && (
            <Card style={styles.insightsCard}>
              <ThemedText type="label" themeColor="textSecondary" style={styles.insightsLabel}>
                VS {monthLabel(monthBefore(viewedMonth)).split(' ')[0].toUpperCase()}
              </ThemedText>
              <InsightRow label="Income" delta={glance.totalIncome - prevSnapshot.total_income} />
              <InsightRow label="Fixed bills" delta={glance.totalFixed - prevSnapshot.total_fixed} invert />
              <InsightRow label="Saved toward goals" delta={glance.goalsSaved - prevSnapshot.goals_saved_total} />
              {Math.round(glance.weeklyAllowance * 100) !== Math.round(prevSnapshot.weekly_allowance * 100) && (
                <ThemedText type="small" themeColor="textSecondary" style={styles.allowanceNote}>
                  Weekly allowance changed from {fmt(prevSnapshot.weekly_allowance)} to {fmt(glance.weeklyAllowance)}
                </ThemedText>
              )}
            </Card>
          )}

          {/* Spending trend */}
          <SectionHeader title="Spending trend" />
          <ThemedText type="small" themeColor="textSecondary" style={styles.trendNote}>
            Total variable spending logged each month.
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
          <SectionHeader title="Where the money went" action={viewedMonthName} />
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
    </Screen>
  );
}

function InsightRow({ label, delta, invert }: { label: string; delta: number; invert?: boolean }) {
  const flat = Math.round(delta * 100) === 0;
  const up = delta > 0;
  const good = invert ? !up : up;
  return (
    <View style={styles.insightRow}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      {flat ? (
        <ThemedText type="small" themeColor="textSecondary">
          No change
        </ThemedText>
      ) : (
        <ThemedText type="small" style={good ? styles.good : styles.warn}>
          {up ? '↑' : '↓'} {fmt(Math.abs(delta))}
        </ThemedText>
      )}
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
  noSnapshotCard: { paddingVertical: Spacing.five },
  noSnapshotText: { textAlign: 'center' },
  insightsCard: { marginTop: Spacing.three, gap: Spacing.one + 2 },
  insightsLabel: { letterSpacing: 0.6, marginBottom: Spacing.one },
  insightRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  good: { color: Palette.sageDeep },
  warn: { color: Palette.terracottaDeep },
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
