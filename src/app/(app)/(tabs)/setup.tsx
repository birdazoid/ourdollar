import { useRouter } from 'expo-router';
import { ChevronRight, Compass, Minus, Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { ConfirmDialog, type ConfirmState } from '@/components/confirm-dialog';
import { IncomeSheet, type IncomeDraft } from '@/components/income-sheet';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SectionHeader } from '@/components/section-header';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useHousehold } from '@/lib/household';
import { FREQ, computeBudget, fmt, monthlyEquiv } from '@/lib/money';
import {
  useBills,
  useExtraIncome,
  useFunMoneyMutations,
  useFunPeople,
  useFunSettings,
  useGoals,
  useHouseholdMutations,
  useIncome,
  useIncomeMutations,
  useMembers,
} from '@/lib/queries';
import { WeekStartPicker } from '@/components/week-start-picker';
import { weekdayName } from '@/lib/week';
import type { IncomeSource } from '@/lib/types';

export default function SetupScreen() {
  const router = useRouter();
  const { householdId, household } = useHousehold();
  const householdMut = useHouseholdMutations(householdId);

  const members = useMembers(householdId);
  const income = useIncome(householdId);
  const extraIncome = useExtraIncome(householdId);
  const bills = useBills(householdId);
  const goals = useGoals(householdId);
  const funPeople = useFunPeople(householdId);
  const funSettings = useFunSettings(householdId);

  const incomeMut = useIncomeMutations(householdId);
  const funMut = useFunMoneyMutations(householdId);

  const [sheet, setSheet] = useState<{ source: IncomeSource | null } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const memberName = useMemo(() => {
    const map = new Map((members.data ?? []).map((m) => [m.id, m]));
    return (id: string | null) => (id ? map.get(id) ?? null : null);
  }, [members.data]);

  const funEnabled = funSettings.data?.enabled ?? false;
  const budget = computeBudget({
    incomeSources: income.data ?? [],
    extraIncome: extraIncome.data ?? [],
    bills: bills.data ?? [],
    goals: goals.data ?? [],
    funMoneyEnabled: funEnabled,
    funPeople: funPeople.data ?? [],
  });

  const loading = !householdId || income.isLoading || members.isLoading;

  function handleSave(draft: IncomeDraft, id?: string) {
    if (id) incomeMut.update.mutate({ id, ...draft });
    else incomeMut.create.mutate(draft);
    setSheet(null);
  }

  function handleDelete(id: string) {
    const src = (income.data ?? []).find((s) => s.id === id);
    const who = memberName(src?.member_id ?? null)?.name;
    setSheet(null);
    setConfirm({
      title: 'Delete this income source?',
      message: `This removes ${who ? who + "'s " : ''}income from your monthly total.`,
      onConfirm: () => incomeMut.remove.mutate(id),
    });
  }

  function stepFun(id: string, current: number, delta: number) {
    funMut.setPersonAmount.mutate({ id, monthly_amount: Math.max(0, current + delta) });
  }

  return (
    <Screen>
      <ScreenHeader eyebrow="The numbers behind it all" title="Income & Setup" />

      {loading ? (
        <ActivityIndicator color={Palette.sageDeep} style={styles.loading} />
      ) : (
        <>
          {/* INCOME */}
          <SectionHeader title="Monthly income" action="the foundation" />
          {(income.data ?? []).map((s) => {
            const m = memberName(s.member_id);
            const label = m?.name ?? 'Household';
            return (
              <Pressable key={s.id} onPress={() => setSheet({ source: s })}>
                <Card style={styles.row}>
                  <View style={styles.avatar}>
                    <ThemedText type="bodyBold" style={styles.avatarGlyph}>
                      {m?.avatar || label[0]}
                    </ThemedText>
                  </View>
                  <View style={styles.rowBody}>
                    <ThemedText type="bodyBold">{label}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {fmt(s.amount)} · {FREQ[s.frequency].label}
                    </ThemedText>
                  </View>
                  <ThemedText type="subtitle">
                    {fmt(Math.round(monthlyEquiv(s)))}
                    <ThemedText type="small" themeColor="textSecondary">
                      {' '}
                      /mo
                    </ThemedText>
                  </ThemedText>
                </Card>
              </Pressable>
            );
          })}

          {(extraIncome.data ?? []).map((x) => {
            const m = memberName(x.member_id);
            return (
              <Card key={x.id} style={styles.row}>
                <View style={[styles.avatar, styles.extraAvatar]}>
                  <ThemedText type="body">💸</ThemedText>
                </View>
                <View style={styles.rowBody}>
                  <ThemedText type="bodyBold">{x.source}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    one-off{m ? ` · ${m.name}` : ''}
                  </ThemedText>
                </View>
                <ThemedText type="subtitle" themeColor="positiveDeep">
                  {fmt(x.amount)}
                </ThemedText>
              </Card>
            );
          })}

          <DashedAdd label="Add income" onPress={() => setSheet({ source: null })} />

          {/* FIXED EXPENSES context */}
          <SectionHeader title="Fixed expenses" action="from your bills" />
          <Card>
            <View style={styles.spread}>
              <View style={styles.flex}>
                <ThemedText type="bodyBold">Committed to bills</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {budget.fixedPct}% of your monthly income
                </ThemedText>
              </View>
              <ThemedText type="title" themeColor="warningDeep">
                −{fmt(budget.totalFixed)}
              </ThemedText>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.min(100, budget.fixedPct)}%` }]} />
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
              This comes off the top before anything else — what&apos;s left becomes the pool below.
            </ThemedText>
          </Card>

          {/* WEEKLY ALLOWANCE (auto-computed) */}
          <SectionHeader title="Weekly spending allowance" action="auto-balanced" />
          <Card>
            <View style={styles.spread}>
              <View style={styles.flex}>
                <ThemedText type="bodyBold">Pool for the month</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Income minus fixed bills, goals &amp; fun money
                </ThemedText>
              </View>
              <ThemedText type="subtitle">{fmt(budget.monthlyPool)}</ThemedText>
            </View>
            <View style={[styles.spread, styles.divider]}>
              <View style={styles.flex}>
                <ThemedText type="bodyBold">Per week</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  The pool above, split 4 ways
                </ThemedText>
              </View>
              <ThemedText type="title">{fmt(budget.weeklyAllowance)}</ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
              Adjusts automatically when income, savings goals, or fun money change.
            </ThemedText>
          </Card>

          {/* WEEK START */}
          <SectionHeader title="Your week" />
          <Card>
            <ThemedText type="bodyBold">Week starts on</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.weekStartNote}>
              The Week screen resets each {weekdayName(household?.week_start_day ?? 0)}.
            </ThemedText>
            <WeekStartPicker
              value={household?.week_start_day ?? 0}
              onChange={(d) => householdMut.setWeekStart.mutate(d)}
            />
          </Card>

          {/* FUN MONEY */}
          <SectionHeader title="Fun money" />
          <Card style={styles.row}>
            <View style={styles.rowBody}>
              <ThemedText type="bodyBold">✨ Enable fun money</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                A no-questions-asked personal stash
              </ThemedText>
            </View>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: funEnabled }}
              onPress={() => funMut.setEnabled.mutate(!funEnabled)}
              style={[styles.switch, funEnabled && styles.switchOn]}>
              <View style={[styles.knob, funEnabled && styles.knobOn]} />
            </Pressable>
          </Card>

          {funEnabled &&
            (funPeople.data ?? []).map((p) => {
              const m = memberName(p.member_id);
              return (
                <Card key={p.id} style={styles.row}>
                  <ThemedText type="bodyBold" style={styles.flex}>
                    {m?.name ?? 'Member'}
                  </ThemedText>
                  <View style={styles.stepper}>
                    <Pressable
                      accessibilityLabel="Decrease"
                      onPress={() => stepFun(p.id, p.monthly_amount, -10)}
                      style={styles.stepBtn}>
                      <Minus size={16} color={Palette.ink} />
                    </Pressable>
                    <ThemedText type="subtitle" style={styles.stepAmount}>
                      {fmt(p.monthly_amount)}
                    </ThemedText>
                    <Pressable
                      accessibilityLabel="Increase"
                      onPress={() => stepFun(p.id, p.monthly_amount, 10)}
                      style={styles.stepBtn}>
                      <Plus size={16} color={Palette.ink} />
                    </Pressable>
                  </View>
                </Card>
              );
            })}

          {funEnabled && (
            <DashedAdd label="Add a household member" onPress={() => router.push('/profile')} />
          )}

          {/* SETUP GUIDE */}
          <SectionHeader title="Setup guide" />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Replay setup guide"
            onPress={() => router.push('/onboarding')}>
            <Card style={styles.row}>
              <View style={styles.replayIcon}>
                <Compass size={18} color={Palette.sageDeep} />
              </View>
              <View style={styles.rowBody}>
                <ThemedText type="bodyBold">Replay setup guide</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Walk through income, bills &amp; goals again
                </ThemedText>
              </View>
              <ChevronRight size={16} color="#B7B8C4" />
            </Card>
          </Pressable>
        </>
      )}

      <IncomeSheet
        visible={!!sheet}
        source={sheet?.source ?? null}
        members={members.data ?? []}
        onClose={() => setSheet(null)}
        onSave={handleSave}
        onDelete={handleDelete}
        saving={incomeMut.create.isPending || incomeMut.update.isPending}
      />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </Screen>
  );
}

function DashedAdd({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.dashedAdd}>
      <View style={styles.plusBadge}>
        <Plus size={16} color={Palette.card} strokeWidth={3} />
      </View>
      <ThemedText type="label">{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: Spacing.six },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginBottom: Spacing.two + 2,
  },
  rowBody: { flex: 1, gap: 2 },
  flex: { flex: 1 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    backgroundColor: Palette.sage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  extraAvatar: {
    borderRadius: Radius.medium,
    backgroundColor: 'rgba(129,178,154,0.18)',
  },
  avatarGlyph: { color: Palette.card },
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three },
  divider: {
    marginTop: Spacing.three,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(61,64,91,0.15)',
  },
  progressTrack: {
    height: 8,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(61,64,91,0.06)',
    overflow: 'hidden',
    marginTop: Spacing.three,
  },
  progressFill: { height: '100%', borderRadius: Radius.pill, backgroundColor: '#B8B29B' },
  footnote: {
    marginTop: Spacing.three,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(61,64,91,0.15)',
  },
  weekStartNote: { marginTop: 2, marginBottom: Spacing.three },
  replayIcon: {
    width: 38,
    height: 38,
    borderRadius: Radius.medium,
    backgroundColor: 'rgba(129,178,154,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashedAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(61,64,91,0.25)',
    borderRadius: Radius.large,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    marginTop: Spacing.two,
  },
  plusBadge: {
    width: 26,
    height: 26,
    borderRadius: Radius.pill,
    backgroundColor: Palette.sageDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switch: {
    width: 48,
    height: 28,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(61,64,91,0.15)',
    padding: 3,
    justifyContent: 'center',
  },
  switchOn: { backgroundColor: Palette.sage },
  knob: {
    width: 22,
    height: 22,
    borderRadius: Radius.pill,
    backgroundColor: Palette.card,
  },
  knobOn: { alignSelf: 'flex-end' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(61,64,91,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepAmount: { minWidth: 64, textAlign: 'center' },
});
