import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import IconFreeToSpend from '@/assets/icons/icon-free-to-spend.svg';
import { Card } from '@/components/card';
import { CategoryGlyph } from '@/components/category-glyph';
import { EnvelopeSheet } from '@/components/envelope-sheet';
import { HeroCard } from '@/components/hero-card';
import { ListRow } from '@/components/list-row';
import { Ring } from '@/components/ring';
import { RolloverPrompt } from '@/components/rollover-prompt';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SectionHeader } from '@/components/section-header';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { txCategoryById } from '@/lib/categories';
import { useHousehold } from '@/lib/household';
import { computeBudget, computeEnvelopes, fmt, type EnvelopeStatus } from '@/lib/money';
import {
  useBills,
  useEnvelopes,
  useEnvelopeMutations,
  useExtraIncome,
  useFunPeople,
  useFunSettings,
  useGoals,
  useIncome,
  useMembers,
  useRolloverSettled,
  useSettleRollover,
  useTransactions,
  useWeekAdjustment,
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

  const [offset, setOffset] = useState(0);
  const [envSheet, setEnvSheet] = useState<{ envelope: WeeklyEnvelope | null } | null>(null);
  const isCurrent = offset === 0;
  const week = useMemo(() => getWeek(offset, weekStart), [offset, weekStart]);
  const lastWeek = useMemo(() => getWeek(-1, weekStart), [weekStart]);

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
    .filter((t) => t.type === 'expense' && !t.is_fun_money)
    .reduce((a, t) => a + t.amount, 0);
  const lastIncomeBack = lastWeekTxns.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0);
  const lastRemaining = Math.round((allowance - lastSpent + lastIncomeBack) * 100) / 100;

  const rolloverSettled = useRolloverSettled(householdId, isCurrent ? lastWeek.start : null);
  const settleRollover = useSettleRollover(householdId);
  const me = (members.data ?? []).find((m) => m.account_id === session?.user.id) ?? null;

  const showRolloverPrompt =
    isCurrent && allowance > 0 && lastRemaining !== 0 && rolloverSettled.data === false;

  function resolveRollover(resolution: RolloverResolution, goalId?: string) {
    const goal = goalId ? (goals.data ?? []).find((g) => g.id === goalId) : undefined;
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
    if (t.type === 'expense' && !t.is_fun_money) {
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
  const envFreeFrac =
    envSummary.effAllowance > 0
      ? Math.max(0, Math.min(1, Math.max(envFree, 0) / envSummary.effAllowance))
      : 0;

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

  return (
    <Screen>
      <ScreenHeader eyebrow="This week" title="Week" />

      {loading ? (
        <ActivityIndicator color={Palette.sageDeep} style={styles.loading} />
      ) : (
        <>
          {showEnvelopes ? (
            <HeroCard
              eyebrow="This week's free-to-spend"
              big={envFree < 0 ? '-' + fmt(-envFree) : fmt(envFree)}
              bigColor={envFree < 0 ? Palette.terracottaDeep : Palette.ink}
              sub={`${fmt(envSummary.spent)} spent · ${fmt(envSummary.reserved)} still planned`}
              subColor={envFree < 0 ? Palette.terracottaDeep : undefined}
              ringValue={envFreeFrac}
              ringColor={envFree < 0 ? Palette.terracotta : Palette.sage}
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
              ringColor={over ? Palette.terracotta : Palette.sage}
              ringLabel={over ? 'over' : 'left'}
              ringCenter=""
            />
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
            <ThemedText type="small" themeColor="textSecondary" style={styles.pastNote}>
              Viewing a past week · read only
            </ThemedText>
          )}

          {/* Planned spending (envelopes) — current week. Always shown so a
              household can set envelopes up here; free-to-spend is the last row. */}
          {isCurrent && (
            <>
              <SectionHeader
                title="Planned this week"
                action={envSummary.reserved > 0 ? `${fmt(envSummary.reserved)} still to come` : undefined}
              />
              {envSummary.hasEnvelopes && (
                <Card style={styles.allowCard}>
                  <View style={styles.allowBar}>
                    {envSummary.spent > 0 && (
                      <View style={[styles.allowSeg, { flex: envSummary.spent, backgroundColor: '#B8B29B' }]} />
                    )}
                    {envSummary.reserved > 0 && (
                      <View style={[styles.allowSeg, { flex: envSummary.reserved, backgroundColor: Palette.sand }]} />
                    )}
                    {Math.max(envFree, 0) > 0 && (
                      <View style={[styles.allowSeg, { flex: Math.max(envFree, 0), backgroundColor: Palette.sage }]} />
                    )}
                  </View>
                  <View style={styles.legendRow}>
                    <Legend color="#B8B29B" label="Spent" value={fmt(envSummary.spent)} />
                    <Legend color={Palette.sand} label="Planned" value={fmt(envSummary.reserved)} />
                    <Legend color={Palette.sage} label="Free" value={fmt(Math.max(envFree, 0))} />
                  </View>
                </Card>
              )}
              {envSummary.envelopes.map((env) => (
                <EnvelopeRow
                  key={env.id}
                  env={env}
                  onPress={() => setEnvSheet({ envelope: rawEnvelope(env.id) })}
                  onSkipToggle={() => toggleSkip(env)}
                />
              ))}

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
                          '💵'
                        ) : (
                          <CategoryGlyph txId={cat.id} emoji={cat.emoji} color={cat.color} />
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
    <Pressable onPress={onPress} disabled={disabled} style={styles.navArrow}>
      <Icon size={18} color={disabled ? 'rgba(61,64,91,0.28)' : Palette.ink} />
    </Pressable>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <ThemedText type="small" themeColor="textSecondary">
        {label}{' '}
      </ThemedText>
      <ThemedText type="small">{value}</ThemedText>
    </View>
  );
}

function EnvelopeRow({
  env,
  onPress,
  onSkipToggle,
}: {
  env: EnvelopeStatus;
  onPress: () => void;
  onSkipToggle: () => void;
}) {
  const cat = txCategoryById(env.category);
  const frac = env.budget > 0 ? Math.max(0, Math.min(1, env.spent / env.budget)) : 0;
  const barColor =
    env.state === 'over' ? Palette.terracotta : env.state === 'skipped' ? '#C7C4B8' : Palette.sage;

  let subtitle: string;
  let rightText: string;
  let rightColor: string | undefined;
  if (env.state === 'skipped') {
    subtitle = 'Skipped this week';
    rightText = '—';
  } else if (env.state === 'untouched') {
    subtitle = 'Not spent yet · still to come';
    rightText = `${fmt(env.remaining)} left`;
  } else if (env.state === 'over') {
    subtitle = `${fmt(env.spent)} of ${fmt(env.budget)}`;
    rightText = `${fmt(env.over)} over`;
    rightColor = Palette.terracottaDeep;
  } else {
    subtitle = `${fmt(env.spent)} of ${fmt(env.budget)}`;
    rightText = `${fmt(env.remaining)} left`;
  }

  return (
    <ListRow
      emoji={<CategoryGlyph txId={cat.id} emoji={cat.emoji} color={cat.color} />}
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
          <Pressable onPress={onSkipToggle} hitSlop={8} style={styles.skipBtn}>
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
  pastNote: { textAlign: 'center', marginTop: Spacing.two },
  allowCard: { marginBottom: Spacing.three, gap: Spacing.two + 2 },
  allowBar: {
    flexDirection: 'row',
    height: 12,
    borderRadius: Radius.pill,
    overflow: 'hidden',
    backgroundColor: 'rgba(61,64,91,0.06)',
  },
  allowSeg: { height: '100%' },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendDot: { width: 8, height: 8, borderRadius: Radius.pill, marginRight: Spacing.one },
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
