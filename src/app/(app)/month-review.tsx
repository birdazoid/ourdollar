import { useLocalSearchParams, useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import IconBills from '@/assets/icons/icon-bills.svg';
import IconGraph from '@/assets/icons/icon-graph.svg';
import IconWeek from '@/assets/icons/icon-week.svg';
import { BarChart, type Bar } from '@/components/bar-chart';
import { BillSheet } from '@/components/bill-sheet';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { CategoryGlyph } from '@/components/category-glyph';
import { ListRow } from '@/components/list-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { billEmoji } from '@/lib/categories';
import { useHousehold } from '@/lib/household';
import { useEnsureMonthClosed } from '@/lib/month-close';
import { billMonthlyCost, computeBudget, fmt } from '@/lib/money';
import {
  lastCompletedMonthStart,
  monthLabel,
  monthStartISO,
  weekBucketsInMonth,
} from '@/lib/month-review';
import {
  useBillCarryovers,
  useBillMutations,
  useBills,
  useExtraIncome,
  useFunPeople,
  useFunSettings,
  useGoals,
  useIncome,
  useMembers,
  useMonthSnapshots,
  useResolveCarryover,
  useTransactions,
  type BillInput,
} from '@/lib/queries';
import type { Bill } from '@/lib/types';

const STEPS = ['Summary', 'Confirm bills', 'Unpaid bills', 'Start month'];

export default function MonthReviewScreen() {
  const router = useRouter();
  const { preview } = useLocalSearchParams<{ preview?: string }>();
  const isPreview = preview === '1';

  const { session } = useSession();
  const { householdId, household } = useHousehold();
  const weekStart = household?.week_start_day ?? 0;

  const bills = useBills(householdId);
  const income = useIncome(householdId);
  const extraIncome = useExtraIncome(householdId);
  const goals = useGoals(householdId);
  const funPeople = useFunPeople(householdId);
  const funSettings = useFunSettings(householdId);
  const members = useMembers(householdId);
  const snapshots = useMonthSnapshots(householdId);
  const carryovers = useBillCarryovers(householdId);
  const billMut = useBillMutations(householdId);
  const resolveCarryover = useResolveCarryover(householdId);

  // Real (non-preview) opens double as a same-tick safety net: if the passive
  // MonthAutoClose (mounted at the app root) hasn't fired yet for some reason,
  // opening the wizard triggers the exact same idempotent close itself.
  useEnsureMonthClosed(!isPreview);

  const [step, setStep] = useState(0);
  const [billSheet, setBillSheet] = useState<{ bill: Bill | null } | null>(null);

  const targetMonth = useMemo(() => monthStartISO(lastCompletedMonthStart()), []);
  const currentMonth = useMemo(() => monthStartISO(new Date()), []);

  const liveBillList = bills.data ?? [];
  const targetSnapshot = (snapshots.data ?? []).find((s) => s.month === targetMonth);
  // Once the month closes, bills reset for the NEW cycle — so live bill rows no
  // longer describe targetMonth. Prefer the snapshot (survives the reset);
  // live figures are only accurate before the close has happened.
  const hasClosed = !!targetSnapshot;
  const billsPaidAmount = hasClosed
    ? targetSnapshot!.bills_paid_amount
    : liveBillList.filter((b) => b.paid).reduce((a, b) => a + billMonthlyCost(b), 0);
  const billsTotalAmount = hasClosed
    ? targetSnapshot!.bills_total_amount
    : liveBillList.reduce((a, b) => a + billMonthlyCost(b), 0);
  const billsPaidCount = hasClosed ? targetSnapshot!.bills_paid_count : liveBillList.filter((b) => b.paid).length;
  const billsTotalCount = hasClosed ? targetSnapshot!.bills_total_count : liveBillList.length;

  const targetCarryovers = (carryovers.data ?? []).filter((c) => c.from_month === targetMonth);
  const liveUnpaidBills = liveBillList.filter((b) => !b.paid);

  const prevMonthKey = useMemo(() => {
    const [y, m] = targetMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1); // one month before targetMonth
    return monthStartISO(d);
  }, [targetMonth]);
  const prevSnapshot = (snapshots.data ?? []).find((s) => s.month === prevMonthKey);
  const billsDelta = prevSnapshot ? billsPaidAmount - prevSnapshot.bills_paid_amount : null;

  // Variable spending this month vs last — computed live from transactions
  // (never reset, so this works even before any snapshot history exists).
  const allTransactions = useTransactions(householdId);
  const transactions = useMemo(
    () => (allTransactions.data ?? []).filter((t) => t.type === 'expense' && !t.is_fun_money),
    [allTransactions.data]
  );
  const thisMonthSpend = sumExpenses(transactions, targetMonth.slice(0, 7));
  const prevMonthSpend = sumExpenses(transactions, prevMonthKey.slice(0, 7));
  const spendDelta = prevMonthSpend > 0 ? thisMonthSpend - prevMonthSpend : null;

  const funEnabled = funSettings.data?.enabled ?? false;
  const budget = computeBudget({
    incomeSources: income.data ?? [],
    extraIncome: extraIncome.data ?? [],
    bills: liveBillList,
    goals: goals.data ?? [],
    funMoneyEnabled: funEnabled,
    funPeople: funPeople.data ?? [],
  });
  const weeklyAllowanceForCharts = hasClosed ? targetSnapshot!.weekly_allowance : budget.weeklyAllowance;

  const weekBars: (Bar & { isFull: boolean })[] = useMemo(() => {
    const buckets = weekBucketsInMonth(targetMonth, weekStart);
    return buckets.map((b) => {
      const value = transactions
        .filter((t) => t.occurred_on >= b.clippedStart && t.occurred_on <= b.clippedEnd)
        .reduce((a, t) => a + t.amount, 0);
      const days = Math.round((+new Date(b.clippedEnd) - +new Date(b.clippedStart)) / 86400000) + 1;
      return { label: b.label, value, isFull: days === 7 };
    });
  }, [targetMonth, weekStart, transactions]);
  const fullWeeks = weekBars.filter((w) => w.isFull);
  const overWeekCount = fullWeeks.filter((w) => w.value > weeklyAllowanceForCharts).length;

  const fixedBills = liveBillList.filter((b) => !b.varies);
  const me = (members.data ?? []).find((m) => m.account_id === session?.user.id) ?? null;

  const loading = !householdId || bills.isLoading || snapshots.isLoading;

  function exitWizard() {
    if (router.canGoBack()) router.back();
    else router.replace('/bills');
  }

  function saveBill(input: BillInput, id?: string) {
    if (id) billMut.update.mutate({ id, ...input });
    setBillSheet(null);
  }

  function dismissCarryover(id: string) {
    resolveCarryover.mutate({ id, markPaid: false, settledByMemberId: me?.id ?? null });
  }

  // Closing already happened (passively, or via the safety-net hook above) by
  // the time anyone reaches this final step — there's nothing left to commit.
  function finish() {
    exitWizard();
  }

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <ThemedText type="label" themeColor="textSecondary">
              {isPreview ? 'Preview · ' : ''}Step {step + 1} of {STEPS.length} · {STEPS[step]}
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={exitWizard}
              style={styles.closeBtn}>
              <X size={16} color={Palette.ink} />
            </Pressable>
          </View>
          <View style={styles.progressRow}>
            {STEPS.map((s, i) => (
              <View key={s} style={[styles.progressSeg, i <= step && styles.progressOn]} />
            ))}
          </View>
          {isPreview && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.previewNote}>
              Preview only — finishing this won&apos;t change any data.
            </ThemedText>
          )}
        </View>

        {loading ? null : (
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {step === 0 && (
              <View>
                <StepHeader
                  Icon={IconGraph}
                  title={`${monthLabel(targetMonth)} wrapped up`}
                  desc="Here's how the month went before you move on."
                />

                <Card style={styles.summaryCard}>
                  <ThemedText type="bodyBold">Bills</ThemedText>
                  <ThemedText type="title">
                    {fmt(billsPaidAmount)} <ThemedText type="body" themeColor="textSecondary">of {fmt(billsTotalAmount)} paid</ThemedText>
                  </ThemedText>
                  {billsDelta != null ? (
                    <ThemedText type="small" style={billsDelta <= 0 ? styles.good : styles.warn}>
                      {billsDelta <= 0 ? '↓' : '↑'} {fmt(Math.abs(billsDelta))} vs {monthLabel(prevMonthKey)}
                    </ThemedText>
                  ) : (
                    <ThemedText type="small" themeColor="textSecondary">
                      First month tracked — nothing to compare yet.
                    </ThemedText>
                  )}
                </Card>

                <Card style={styles.summaryCard}>
                  <ThemedText type="bodyBold">Variable spending</ThemedText>
                  <ThemedText type="title">{fmt(thisMonthSpend)}</ThemedText>
                  {spendDelta != null ? (
                    <ThemedText type="small" style={spendDelta <= 0 ? styles.good : styles.warn}>
                      {spendDelta <= 0 ? '↓' : '↑'} {fmt(Math.abs(spendDelta))} vs {monthLabel(prevMonthKey)}
                    </ThemedText>
                  ) : (
                    <ThemedText type="small" themeColor="textSecondary">
                      No prior month to compare yet.
                    </ThemedText>
                  )}
                  {fullWeeks.length > 0 && (
                    <ThemedText type="small" themeColor="textSecondary" style={styles.overNote}>
                      {overWeekCount > 0
                        ? `Over budget in ${overWeekCount} of ${fullWeeks.length} full week${fullWeeks.length === 1 ? '' : 's'}.`
                        : `On budget every full week this month.`}
                    </ThemedText>
                  )}
                </Card>

                <ThemedText type="label" themeColor="textSecondary" style={styles.chartLabel}>
                  Spending by week
                </ThemedText>
                <Card style={styles.chartCard}>
                  <BarChart data={weekBars} highlightLast={false} />
                </Card>
              </View>
            )}

            {step === 1 && (
              <View>
                <StepHeader
                  Icon={IconBills}
                  title="Anything change?"
                  desc="A quick check on your fixed bills — tap one to update its amount, or continue if nothing's different."
                />
                {fixedBills.length === 0 ? (
                  <ThemedText type="body" themeColor="textSecondary" style={styles.emptyNote}>
                    No fixed bills to review.
                  </ThemedText>
                ) : (
                  fixedBills.map((b) => (
                    <ListRow
                      key={b.id}
                      emoji={<CategoryGlyph billCategory={b.category} emoji={billEmoji(b.category)} />}
                      title={b.name}
                      subtitle={b.category}
                      onPress={() => setBillSheet({ bill: b })}
                      right={<ThemedText type="label">{b.amount != null ? fmt(b.amount) : '—'}</ThemedText>}
                    />
                  ))
                )}
              </View>
            )}

            {step === 2 && (
              <View>
                <StepHeader
                  Icon={IconBills}
                  title="Anything still unpaid?"
                  desc={
                    hasClosed
                      ? 'Anything left unpaid was automatically flagged below as a reminder. Dismiss any you don’t need to track.'
                      : "These will automatically become reminders once the month closes — nothing to do here."
                  }
                />
                {hasClosed ? (
                  targetCarryovers.length === 0 ? (
                    <Card style={styles.allPaidCard}>
                      <ThemedText type="subtitle">Nothing left unpaid — nice!</ThemedText>
                    </Card>
                  ) : (
                    targetCarryovers.map((c) => (
                      <ListRow
                        key={c.id}
                        emoji={<CategoryGlyph billCategory={c.category} emoji={billEmoji(c.category)} />}
                        title={c.name}
                        subtitle={c.amount != null ? fmt(c.amount) : 'Amount varies'}
                        right={
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Dismiss ${c.name}`}
                            onPress={() => dismissCarryover(c.id)}
                            style={styles.dismissBtn}>
                            <ThemedText type="small">Dismiss</ThemedText>
                          </Pressable>
                        }
                      />
                    ))
                  )
                ) : liveUnpaidBills.length === 0 ? (
                  <Card style={styles.allPaidCard}>
                    <ThemedText type="subtitle">Nothing unpaid — nice!</ThemedText>
                  </Card>
                ) : (
                  liveUnpaidBills.map((b) => (
                    <ListRow
                      key={b.id}
                      emoji={<CategoryGlyph billCategory={b.category} emoji={billEmoji(b.category)} />}
                      title={b.name}
                      subtitle={b.amount != null ? fmt(b.amount) : 'Amount varies'}
                    />
                  ))
                )}
              </View>
            )}

            {step === 3 && (
              <View>
                <StepHeader
                  Icon={IconWeek}
                  title={`Start ${monthLabel(currentMonth)}`}
                  desc="Bills are reset for a fresh cycle. Anything left unpaid stays as a reminder on your Bills screen."
                />
                <Card style={styles.recapCard}>
                  <RecapRow label="Bills paid" value={`${billsPaidCount} of ${billsTotalCount} (${fmt(billsPaidAmount)})`} />
                  <RecapRow
                    label="Still tracked as unpaid"
                    value={`${hasClosed ? targetCarryovers.length : liveUnpaidBills.length} bill${
                      (hasClosed ? targetCarryovers.length : liveUnpaidBills.length) === 1 ? '' : 's'
                    }`}
                  />
                </Card>
              </View>
            )}
          </ScrollView>
        )}

        <View style={styles.footer}>
          {step > 0 && (
            <Pressable accessibilityRole="button" onPress={() => setStep((s) => s - 1)} style={styles.backBtn}>
              <ThemedText type="bodyBold">Back</ThemedText>
            </Pressable>
          )}
          <View style={styles.flex}>
            <Button
              title={
                step === STEPS.length - 1
                  ? isPreview
                    ? 'Done previewing'
                    : `Start ${monthLabel(currentMonth)}`
                  : 'Continue'
              }
              onPress={() => (step === STEPS.length - 1 ? finish() : setStep((s) => s + 1))}
            />
          </View>
        </View>
      </SafeAreaView>

      <BillSheet
        visible={!!billSheet}
        bill={billSheet?.bill ?? null}
        onClose={() => setBillSheet(null)}
        onSave={saveBill}
        onDelete={() => setBillSheet(null)}
        saving={billMut.update.isPending}
      />
    </ThemedView>
  );
}

function StepHeader({
  Icon,
  title,
  desc,
}: {
  Icon: React.ComponentType<{ width?: number; height?: number; color?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <View style={styles.stepHeader}>
      <View style={styles.stepIcon}>
        <Icon width={26} height={26} color={Palette.ink} />
      </View>
      <ThemedText type="subtitle">{title}</ThemedText>
      <ThemedText type="body" themeColor="textSecondary" style={styles.stepDesc}>
        {desc}
      </ThemedText>
    </View>
  );
}

function RecapRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.recapRow}>
      <ThemedText type="body" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="bodyBold">{value}</ThemedText>
    </View>
  );
}

function sumExpenses(transactions: { occurred_on: string; amount: number }[], monthKey: string): number {
  return transactions
    .filter((t) => t.occurred_on.startsWith(monthKey))
    .reduce((a, t) => a + t.amount, 0);
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  header: { paddingHorizontal: Spacing.four, paddingTop: Spacing.four, paddingBottom: Spacing.two },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.two,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.pill,
    backgroundColor: Palette.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressRow: { flexDirection: 'row', gap: Spacing.one + 2 },
  progressSeg: { flex: 1, height: 5, borderRadius: Radius.pill, backgroundColor: 'rgba(61,64,91,0.12)' },
  progressOn: { backgroundColor: Palette.sage },
  previewNote: { marginTop: Spacing.two },
  body: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two, paddingBottom: Spacing.five },

  stepHeader: { marginBottom: Spacing.three },
  stepIcon: {
    width: 48,
    height: 48,
    borderRadius: Radius.medium,
    backgroundColor: 'rgba(129,178,154,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  stepDesc: { marginTop: Spacing.two, lineHeight: 22 },

  summaryCard: { marginBottom: Spacing.three, gap: Spacing.one },
  good: { color: Palette.sageDeep },
  warn: { color: Palette.terracottaDeep },
  overNote: { marginTop: Spacing.one },
  chartLabel: { marginBottom: Spacing.two },
  chartCard: { paddingVertical: Spacing.three },

  emptyNote: { textAlign: 'center', paddingVertical: Spacing.four },
  allPaidCard: { alignItems: 'center', paddingVertical: Spacing.five },

  dismissBtn: {
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.two + 2,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(61,64,91,0.06)',
  },

  recapCard: { gap: Spacing.two },
  recapRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  footer: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(61,64,91,0.12)',
  },
  backBtn: {
    height: 52,
    borderRadius: Radius.large,
    backgroundColor: Palette.card,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
});
