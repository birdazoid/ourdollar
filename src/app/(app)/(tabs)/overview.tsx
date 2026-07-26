import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { BarChart, type Bar } from '@/components/bar-chart';
import { Card } from '@/components/card';
import { CategoryGlyph } from '@/components/category-glyph';
import { Donut } from '@/components/donut';
import { MoneyRow } from '@/components/money-row';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SectionHeader } from '@/components/section-header';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { txCategoryById } from '@/lib/categories';
import { useHousehold } from '@/lib/household';
import { FREQ, computeBudget, fmt, monthlyEquiv } from '@/lib/money';
import {
  useBills,
  useExtraIncome,
  useFunPeople,
  useFunSettings,
  useGoals,
  useIncome,
  useMembers,
  useTransactions,
} from '@/lib/queries';

const MONTH_LABEL = new Date().toLocaleDateString('en-US', { month: 'long' });

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function OverviewScreen() {
  const { householdId } = useHousehold();
  const members = useMembers(householdId);
  const income = useIncome(householdId);
  const extraIncome = useExtraIncome(householdId);
  const bills = useBills(householdId);
  const goals = useGoals(householdId);
  const funPeople = useFunPeople(householdId);
  const funSettings = useFunSettings(householdId);
  const transactions = useTransactions(householdId);

  const [range, setRange] = useState<'3' | '6' | '9' | '12'>('3');

  const funEnabled = funSettings.data?.enabled ?? false;
  const budget = computeBudget({
    incomeSources: income.data ?? [],
    extraIncome: extraIncome.data ?? [],
    bills: bills.data ?? [],
    goals: goals.data ?? [],
    funMoneyEnabled: funEnabled,
    funPeople: funPeople.data ?? [],
  });

  const memberName = (id: string | null) =>
    (members.data ?? []).find((m) => m.id === id)?.name ?? 'Household';

  const pie = [
    { name: 'Fixed expenses', value: budget.totalFixed, color: Palette.ink },
    { name: 'Weekly allowance', value: budget.monthlyPool, color: Palette.sage },
    { name: 'Savings goals', value: budget.goalsMonthly, color: Palette.terracotta },
    { name: 'Fun money', value: budget.funTotal, color: Palette.sandDeep },
  ].filter((d) => d.value > 0);

  // Current-month category breakdown of variable spending.
  const thisMonth = monthKey(new Date());
  const catTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    (transactions.data ?? []).forEach((t) => {
      if (t.type === 'expense' && t.occurred_on.startsWith(thisMonth)) {
        totals[t.category ?? 'other'] = (totals[t.category ?? 'other'] ?? 0) + t.amount;
      }
    });
    return Object.entries(totals)
      .map(([id, value]) => ({ ...txCategoryById(id), value }))
      .sort((a, b) => b.value - a.value);
  }, [transactions.data, thisMonth]);
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

  const loading = !householdId || income.isLoading || transactions.isLoading;

  return (
    <Screen>
      <ScreenHeader eyebrow={`${MONTH_LABEL} 2026`} title="Overview" />

      {loading ? (
        <ActivityIndicator color={Palette.sageDeep} style={styles.loading} />
      ) : (
        <>
          {/* Month at a glance */}
          <SectionHeader title="Month at a glance" />
          <Card style={styles.glanceCard}>
            {pie.length > 0 && (
              <View style={styles.donutWrap}>
                <Donut segments={pie}>
                  <ThemedText type="small" themeColor="textSecondary">
                    INCOME
                  </ThemedText>
                  <ThemedText type="subtitle">{fmt(budget.totalIncome)}</ThemedText>
                </Donut>
              </View>
            )}

            <MoneyRow label="Total income" value={fmt(budget.totalIncome)} strong color={Palette.sageDeep} />
            {(income.data ?? []).map((s) => (
              <MoneyRow
                key={s.id}
                label={`${memberName(s.member_id)} · ${FREQ[s.frequency].label}`}
                value={fmt(monthlyEquiv(s))}
                sub
              />
            ))}
            {(extraIncome.data ?? []).map((x) => (
              <MoneyRow key={x.id} label={`+ ${x.source}`} value={fmt(x.amount)} sub />
            ))}

            <View style={styles.divider} />
            <MoneyRow label="Fixed expenses" value={`−${fmt(budget.totalFixed)}`} strong color={Palette.terracottaDeep} dot={Palette.ink} />
            <View style={styles.divider} />
            <MoneyRow label="Variable pool" value={fmt(budget.variablePool)} strong color={Palette.sageDeep} />
            <MoneyRow
              label={`Weekly allowance · ${fmt(budget.weeklyAllowance)}/wk ×4`}
              value={`−${fmt(budget.monthlyPool)}`}
              sub
              color={Palette.terracottaDeep}
              dot={Palette.sage}
            />
            <MoneyRow label="Savings goals" value={`−${fmt(budget.goalsMonthly)}`} sub color={Palette.terracottaDeep} dot={Palette.terracotta} />
            <MoneyRow label="Fun money" value={`−${fmt(budget.funTotal)}`} sub color={Palette.terracottaDeep} dot={Palette.sandDeep} />
          </Card>

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
          <SectionHeader title="Where the money went" action={MONTH_LABEL} />
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
                    <CategoryGlyph txId={c.id} emoji={c.emoji} color={c.color} size={21} />
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: Spacing.six },
  glanceCard: { paddingVertical: Spacing.four },
  donutWrap: { alignItems: 'center', marginBottom: Spacing.three },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(61,64,91,0.15)',
    marginVertical: Spacing.two,
  },
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
