import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { HeroCard } from '@/components/hero-card';
import { ListRow } from '@/components/list-row';
import { Ring } from '@/components/ring';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SectionHeader } from '@/components/section-header';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { txCategoryById } from '@/lib/categories';
import { useHousehold } from '@/lib/household';
import { computeBudget, fmt } from '@/lib/money';
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
import type { Transaction } from '@/lib/types';
import { dayHeading, getWeek, weekRangeLabel } from '@/lib/week';

export default function WeekScreen() {
  const router = useRouter();
  const { householdId } = useHousehold();

  const members = useMembers(householdId);
  const transactions = useTransactions(householdId);
  const income = useIncome(householdId);
  const extraIncome = useExtraIncome(householdId);
  const bills = useBills(householdId);
  const goals = useGoals(householdId);
  const funPeople = useFunPeople(householdId);
  const funSettings = useFunSettings(householdId);

  const [offset, setOffset] = useState(0);
  const isCurrent = offset === 0;
  const week = useMemo(() => getWeek(offset), [offset]);

  const funEnabled = funSettings.data?.enabled ?? false;
  const budget = computeBudget({
    incomeSources: income.data ?? [],
    extraIncome: extraIncome.data ?? [],
    bills: bills.data ?? [],
    goals: goals.data ?? [],
    funMoneyEnabled: funEnabled,
    funPeople: funPeople.data ?? [],
  });
  const allowance = budget.weeklyAllowance;

  const weekTxns = (transactions.data ?? []).filter(
    (t) => t.occurred_on >= week.start && t.occurred_on <= week.end
  );
  const spent = weekTxns
    .filter((t) => t.type === 'expense' && !t.is_fun_money)
    .reduce((a, t) => a + t.amount, 0);
  const incomeBack = weekTxns.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0);
  const remaining = allowance - spent + incomeBack;
  const over = remaining < 0;
  const frac = over ? 1 : allowance > 0 ? Math.max(0, Math.min(1, remaining / allowance)) : 0;

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

  return (
    <Screen>
      <ScreenHeader eyebrow="This week" title="Week" />

      {loading ? (
        <ActivityIndicator color={Palette.sageDeep} style={styles.loading} />
      ) : (
        <>
          <HeroCard
            eyebrow={isCurrent ? "This week's spending money" : `Week of ${weekRangeLabel(week.days)}`}
            big={over ? '-' + fmt(-remaining) : fmt(remaining)}
            bigColor={over ? Palette.terracottaDeep : Palette.ink}
            sub={over ? `${fmt(-remaining)} over budget` : `${fmt(spent)} spent of ${fmt(allowance)}`}
            subColor={over ? Palette.terracottaDeep : undefined}
            ringValue={frac}
            ringColor={over ? Palette.terracotta : Palette.sage}
            ringLabel={over ? 'over' : 'left'}
            ringCenter=""
          />

          {/* Day-of-week tracker with week navigation */}
          <View style={styles.trackerRow}>
            <NavArrow dir="left" onPress={() => setOffset(offset - 1)} disabled={false} />
            <Card style={styles.tracker}>
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
            </Card>
            <NavArrow dir="right" onPress={() => setOffset(offset + 1)} disabled={isCurrent} />
          </View>
          {!isCurrent && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.pastNote}>
              Viewing a past week · read only
            </ThemedText>
          )}

          {/* Fun money per person (current week only) */}
          {funEnabled && isCurrent && (funPeople.data ?? []).length > 0 && (
            <>
              <SectionHeader title="Fun money" />
              <View style={styles.funRow}>
                {(funPeople.data ?? []).map((p) => {
                  const funSpent = weekTxns
                    .filter((t) => t.type === 'expense' && t.is_fun_money && t.member_id === p.member_id)
                    .reduce((a, t) => a + t.amount, 0);
                  const rem = p.monthly_amount - funSpent;
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
                          of {fmt(p.monthly_amount)}/mo
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
                      emoji={isIncome ? '💵' : cat.emoji}
                      tileColor={(isIncome ? Palette.sage : cat.color) + '26'}
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
              <ThemedText type="subtitle">🧾</ThemedText>
              <ThemedText type="body" themeColor="textSecondary" style={styles.emptyText}>
                Nothing logged for this week yet.
              </ThemedText>
              {isCurrent && (
                <Pressable onPress={() => router.push('/add-expense')}>
                  <ThemedText type="label" style={{ color: Palette.sageDeep }}>
                    Add first expense
                  </ThemedText>
                </Pressable>
              )}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}

function NavArrow({ dir, onPress, disabled }: { dir: 'left' | 'right'; onPress: () => void; disabled: boolean }) {
  const Icon = dir === 'left' ? ChevronLeft : ChevronRight;
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.navArrow, disabled && styles.navDisabled]}>
      <Icon size={18} color={Palette.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: Spacing.six },
  trackerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.three },
  navArrow: {
    width: 40,
    height: 40,
    borderRadius: Radius.medium,
    backgroundColor: Palette.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navDisabled: { opacity: 0.3 },
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
  pastNote: { textAlign: 'center', marginTop: Spacing.two },
  funRow: { flexDirection: 'row', gap: Spacing.three },
  funCard: {
    flex: 1,
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
