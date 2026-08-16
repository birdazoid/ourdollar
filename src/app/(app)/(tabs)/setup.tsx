import { useRouter } from 'expo-router';
import { ChevronRight, Minus, Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import IconCelebrate from '@/assets/icons/icon-celebrate.svg';
import IconGiftBox from '@/assets/icons/icon-gift-box.svg';
import { AvatarGlyph } from '@/components/avatar-glyph';
import { Card } from '@/components/card';
import { ConfirmDialog, type ConfirmState } from '@/components/confirm-dialog';
import { IncomeSheet, type IncomeDraft, type IncomeTarget } from '@/components/income-sheet';
import { LoadError } from '@/components/load-error';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SectionHeader } from '@/components/section-header';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useHousehold } from '@/lib/household';
import { FREQ, adjustedWeeklyAllowance, computeBudget, fmt, monthlyEquiv } from '@/lib/money';
import { monthOf, periodFor, weeksRemainingInPeriod } from '@/lib/period';
import { todayISO, weekdayName } from '@/lib/week';
import {
  useBills,
  useExtraIncome,
  useFunMoneyMutations,
  useFunPeople,
  useFunSettings,
  useGoals,
  useHouseholdMutations,
  useIncome,
  useExtraIncomeMutations,
  useIncomeMutations,
  useMembers,
} from '@/lib/queries';
import { WeekStartPicker } from '@/components/week-start-picker';

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
  const extraMut = useExtraIncomeMutations(householdId);
  const funMut = useFunMoneyMutations(householdId);

  // One sheet for both recurring and one-off income. `sheetOpen` is separate
  // from `target` because adding has no target but still opens the sheet.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [target, setTarget] = useState<IncomeTarget>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  function openSheet(next: IncomeTarget) {
    setTarget(next);
    setSheetOpen(true);
  }
  function closeSheet() {
    setSheetOpen(false);
    setTarget(null);
  }

  const memberName = useMemo(() => {
    const map = new Map((members.data ?? []).map((m) => [m.id, m]));
    return (id: string | null) => (id ? map.get(id) ?? null : null);
  }, [members.data]);

  const funEnabled = funSettings.data?.enabled ?? false;
  const weekStartDay = household?.week_start_day ?? 0;
  // Setup edits the CURRENT month's plan, so it's that month's period.
  const period = periodFor(monthOf(todayISO()), weekStartDay);
  const budget = computeBudget({
    incomeSources: income.data ?? [],
    extraIncome: extraIncome.data ?? [],
    bills: bills.data ?? [],
    goals: goals.data ?? [],
    funMoneyEnabled: funEnabled,
    funPeople: funPeople.data ?? [],
    weeksInPeriod: period.weeks,
  });
  const weeksLeft = weeksRemainingInPeriod(weekStartDay);
  // What a week is actually worth today, bill variance and all — the same
  // figure the Week screen spends against, so the two never disagree.
  const liveWeekly = adjustedWeeklyAllowance({
    plannedWeekly: budget.weeklyAllowance,
    billVariance: budget.billVariance,
    weeksRemaining: weeksLeft,
  });

  const loading = !householdId || income.isLoading || members.isLoading;
  // Setup is the screen people edit from. Showing an empty income list after a
  // failed fetch invites re-adding income that already exists.
  const loadFailed = income.isError || members.isError || bills.isError;
  const retryLoad = () => {
    income.refetch();
    members.refetch();
    bills.refetch();
  };

  // The sheet reports which kind it saved, so a one-off routes to extra_income
  // and a recurring source to income_sources. Switching cadence to or from
  // one-off while EDITING isn't supported: those are different rows in
  // different tables, so it would be a delete plus an insert, not an update.
  function handleSave(draft: IncomeDraft, id?: string) {
    if (draft.kind === 'one-off') {
      const { kind, ...input } = draft;
      if (id) extraMut.update.mutate({ id, ...input });
      else extraMut.create.mutate(input);
    } else {
      const { kind, ...input } = draft;
      if (id) incomeMut.update.mutate({ id, ...input });
      else incomeMut.create.mutate(input);
    }
    closeSheet();
  }

  function handleDelete(id: string, kind: 'recurring' | 'one-off') {
    closeSheet();
    if (kind === 'one-off') {
      setConfirm({
        title: 'Delete this one-off income?',
        message: 'It will stop counting toward this month’s pool.',
        onConfirm: () => extraMut.remove.mutate(id),
      });
      return;
    }
    const src = (income.data ?? []).find((s) => s.id === id);
    const who = memberName(src?.member_id ?? null)?.name;
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
      ) : loadFailed ? (
        <LoadError onRetry={retryLoad} what="your setup" />
      ) : (
        <>
          {/* The one figure this screen still shows. Everything below feeds it,
              so watching it move while you edit is the point; the full
              breakdown of how it's derived belongs on Overview. */}
          {/* Tappable on purpose. It looks like a card either way, and the one
              thing this screen can't answer is HOW the figure is reached, which
              is exactly what Overview lays out. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Your week right now, see the full breakdown on Overview"
            onPress={() => router.push('/overview')}
            style={styles.liveWeek}>
            <View style={styles.flex}>
              <ThemedText type="bodyBold" style={styles.liveWeekText}>
                Your week right now
              </ThemedText>
              <ThemedText type="small" style={styles.liveWeekSub}>
                Updates as you edit below. Tap for how it&apos;s worked out.
              </ThemedText>
            </View>
            <ThemedText type="title" style={styles.liveWeekText}>
              {fmt(liveWeekly)}
            </ThemedText>
            <ChevronRight size={18} color={Palette.sageDeep} />
          </Pressable>

          {/* INCOME */}
          <SectionHeader title="Monthly income" action="the foundation" />
          {(income.data ?? []).map((s) => {
            const m = memberName(s.member_id);
            const label = m?.name ?? 'Household';
            return (
              <Pressable key={s.id} onPress={() => openSheet({ kind: 'recurring', source: s })}>
                <Card style={styles.row}>
                  <View style={styles.avatar}>
                    {m?.avatar ? (
                      <AvatarGlyph value={m.avatar} size={40} />
                    ) : (
                      <ThemedText type="bodyBold" style={styles.avatarGlyph}>
                        {label[0]}
                      </ThemedText>
                    )}
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
              <Pressable key={x.id} onPress={() => openSheet({ kind: 'one-off', entry: x })}>
                <Card style={styles.row}>
                  <View style={[styles.avatar, styles.extraAvatar]}>
                    <IconGiftBox width={22} height={22} color={Palette.sageDeep} />
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
              </Pressable>
            );
          })}

          <DashedAdd label="Add income" onPress={() => openSheet(null)} />

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
          <SectionHeader title="Fun money" icon={<IconCelebrate width={21} height={21} color={Palette.ink} />} />
          <Card style={styles.row}>
            <View style={styles.rowBody}>
              <ThemedText type="bodyBold">Enable fun money</ThemedText>
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
              <View style={styles.rowBody}>
                <ThemedText type="bodyBold">Replay setup guide</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Walk through income, bills &amp; goals again
                </ThemedText>
              </View>
              <ChevronRight size={16} color="#B7B8C4" />
            </Card>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Preview month-end review"
            onPress={() => router.push('/month-review?preview=1')}>
            <Card style={styles.row}>
              <View style={styles.rowBody}>
                <ThemedText type="bodyBold">Preview month-end review</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  See the wizard anytime — nothing is saved
                </ThemedText>
              </View>
              <ChevronRight size={16} color="#B7B8C4" />
            </Card>
          </Pressable>
        </>
      )}

      <IncomeSheet
        visible={sheetOpen}
        target={target}
        members={members.data ?? []}
        onClose={closeSheet}
        onSave={handleSave}
        onDelete={handleDelete}
        saving={
          incomeMut.create.isPending ||
          incomeMut.update.isPending ||
          extraMut.create.isPending ||
          extraMut.update.isPending
        }
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
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 2 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    backgroundColor: Palette.sage,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  extraAvatar: {
    borderRadius: Radius.medium,
    backgroundColor: 'rgba(129,178,154,0.18)',
  },
  avatarGlyph: { color: Palette.card },
  liveWeek: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: 'rgba(129,178,154,0.16)',
    borderRadius: Radius.large,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  liveWeekText: { color: Palette.sageDeep },
  liveWeekSub: { color: 'rgba(94,143,119,0.85)' },
  weekStartNote: { marginTop: 2, marginBottom: Spacing.three },
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
