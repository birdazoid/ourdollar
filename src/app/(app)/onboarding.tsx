import { useRouter } from 'expo-router';
import type { ComponentType, ReactNode } from 'react';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SvgProps } from 'react-native-svg';

import IconBills from '@/assets/icons/icon-bills.svg';
import IconGiftBox from '@/assets/icons/icon-gift-box.svg';
import { AddMemberSheet } from '@/components/add-member-sheet';
import { AvatarGlyph } from '@/components/avatar-glyph';
import { BillSheet } from '@/components/bill-sheet';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { CategoryGlyph } from '@/components/category-glyph';
import { GoalGlyph } from '@/components/goal-glyph';
import { GoalSheet } from '@/components/goal-sheet';
import { FixedExpensesIllustration } from '@/components/illustrations/fixed-expenses';
import { HouseholdIllustration } from '@/components/illustrations/household';
import { IncomeIllustration } from '@/components/illustrations/income';
import { PlannedSpendingIllustration } from '@/components/illustrations/planned-spending';
import { ReviewIllustration } from '@/components/illustrations/review';
import { SavingsGoalsIllustration } from '@/components/illustrations/savings-goals';
import { IncomeSheet, type IncomeDraft, type IncomeTarget } from '@/components/income-sheet';
import { ListGroup } from '@/components/list-group';
import { ListRow } from '@/components/list-row';
import { MoneyRow } from '@/components/money-row';
import { PlannedSpending } from '@/components/planned-spending';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { billEmoji } from '@/lib/categories';
import { ordinal } from '@/lib/format';
import { useHousehold } from '@/lib/household';
import { FREQ, computeBudget, fmt, monthlyEquiv } from '@/lib/money';
import { dueDayInMonth, monthOf, weeksInPeriod } from '@/lib/period';
import {
  useBillMutations,
  useBills,
  useCompleteOnboarding,
  useEnvelopes,
  useExtraIncome,
  useFunPeople,
  useFunSettings,
  useGoalMutations,
  useGoals,
  useIncome,
  useIncomeMutations,
  useExtraIncomeMutations,
  sendInvite,
  useMemberMutations,
  useMembers,
  type BillInput,
  type GoalInput,
  type NewMemberInput,
} from '@/lib/queries';
import type { Bill, Goal } from '@/lib/types';
import { todayISO } from '@/lib/week';

/**
 * The setup guide, in the order its questions can actually be answered.
 *
 * Testers found the old order confusing in specific places: it asked them to
 * set aside weekly money for groceries before telling them what their weekly
 * money was; the review at the end left out planned spending, so the number
 * they landed on had never appeared; it asked when their week starts in the
 * middle of "who's in your household"; and three intro screens in a row
 * (profile, household, welcome) read as one step repeating.
 *
 * Now: people, income, bills and goals, then the weekly money they produce,
 * then planned spending against that figure, ending on the same free-to-spend
 * number the Week screen opens with. Week start defaults to Sunday and is
 * changed in Setup.
 */
const STEPS = ['People', 'Income', 'Bills', 'Savings goals', 'Your weekly money', 'Planned spending'];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useSession();
  const { householdId, household } = useHousehold();

  const members = useMembers(householdId);
  const income = useIncome(householdId);
  const extraIncome = useExtraIncome(householdId);
  const bills = useBills(householdId);
  const goals = useGoals(householdId);
  const funPeople = useFunPeople(householdId);
  const funSettings = useFunSettings(householdId);
  const envelopes = useEnvelopes(householdId);

  const incomeMut = useIncomeMutations(householdId);
  const extraMut = useExtraIncomeMutations(householdId);
  const billMut = useBillMutations(householdId);
  const goalMut = useGoalMutations(householdId);
  const memberMut = useMemberMutations(householdId);
  const completeOnboarding = useCompleteOnboarding(session?.user.id ?? null);

  const [step, setStep] = useState(0);
  const [incomeSheetOpen, setIncomeSheetOpen] = useState(false);
  const [incomeTarget, setIncomeTarget] = useState<IncomeTarget>(null);
  const openIncomeSheet = (t: IncomeTarget) => {
    setIncomeTarget(t);
    setIncomeSheetOpen(true);
  };
  const closeIncomeSheet = () => {
    setIncomeSheetOpen(false);
    setIncomeTarget(null);
  };
  const [billSheet, setBillSheet] = useState<{ bill: Bill | null } | null>(null);
  const [goalSheet, setGoalSheet] = useState<{ goal: Goal | null } | null>(null);
  const [addingMember, setAddingMember] = useState(false);

  const weeks = weeksInPeriod(monthOf(todayISO()), household?.week_start_day ?? 0);
  const budget = computeBudget({
    incomeSources: income.data ?? [],
    extraIncome: extraIncome.data ?? [],
    bills: bills.data ?? [],
    goals: goals.data ?? [],
    funMoneyEnabled: funSettings.data?.enabled ?? false,
    funPeople: funPeople.data ?? [],
    weeksInPeriod: weeks,
  });
  const plannedWeekly = (envelopes.data ?? []).reduce((a, e) => a + e.weekly_amount, 0);
  const freeWeekly = budget.weeklyAllowance - plannedWeekly;
  const noIncome = (income.data ?? []).length === 0;

  const memberById = (id: string | null) => (members.data ?? []).find((m) => m.id === id) ?? null;

  // One-off income routes to extra_income, recurring to income_sources.
  function saveIncome(draft: IncomeDraft, id?: string) {
    if (draft.kind === 'one-off') {
      const { kind, ...input } = draft;
      if (id) extraMut.update.mutate({ id, ...input });
      else extraMut.create.mutate(input);
    } else {
      const { kind, ...input } = draft;
      if (id) incomeMut.update.mutate({ id, ...input });
      else incomeMut.create.mutate(input);
    }
    closeIncomeSheet();
  }
  function deleteIncome(id: string, kind: 'recurring' | 'one-off') {
    if (kind === 'one-off') extraMut.remove.mutate(id);
    else incomeMut.remove.mutate(id);
    closeIncomeSheet();
  }
  function saveBill(input: BillInput, id?: string) {
    if (id) billMut.update.mutate({ id, ...input });
    else billMut.create.mutate(input);
    setBillSheet(null);
  }
  function deleteBill(id: string) {
    billMut.remove.mutate(id);
    setBillSheet(null);
  }
  function saveGoal(input: GoalInput, id?: string) {
    if (id) goalMut.update.mutate({ id, ...input });
    else goalMut.create.mutate(input);
    setGoalSheet(null);
  }
  function deleteGoal(id: string) {
    goalMut.remove.mutate(id);
    setGoalSheet(null);
  }
  function addMember(input: NewMemberInput) {
    // Non-owner/admin adds are held for approval, and the invite waits.
    const me = (members.data ?? []).find((m) => m.account_id === session?.user.id);
    const pending = !me?.is_admin;
    memberMut.add.mutate(
      { ...input, approvalPending: pending },
      {
        onSuccess: (memberId) => {
          if (input.inviteEmail && !pending) sendInvite(memberId).catch(() => {});
        },
      }
    );
    setAddingMember(false);
  }

  function exitWizard() {
    completeOnboarding.mutate();
    if (router.canGoBack()) router.back();
    else router.replace('/week');
  }
  function next() {
    if (step === STEPS.length - 1) exitWizard();
    else setStep((s) => s + 1);
  }

  return (
    <ThemedView style={styles.fill}>
      {/* Padded from the root window's insets rather than a SafeAreaView:
          inside an iOS full-screen modal SafeAreaView can measure no inset,
          and the progress header ended up under the status bar. */}
      <View style={[styles.fill, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {/* Progress header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <ThemedText type="label" themeColor="textSecondary">
              Step {step + 1} of {STEPS.length} · {STEPS[step]}
            </ThemedText>
            {/* Said in words. A bare X on every step left people unsure
                whether it kept their progress or threw it away. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Skip setup for now. You can finish it later from Setup."
              hitSlop={8}
              onPress={exitWizard}>
              <ThemedText type="label" style={styles.skip}>
                Skip for now
              </ThemedText>
            </Pressable>
          </View>
          <View style={styles.progressRow}>
            {STEPS.map((s, i) => (
              <View key={s} style={[styles.progressSeg, i <= step && styles.progressOn]} />
            ))}
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {step === 0 && (
            <View>
              <StepHeader
                illustration={HouseholdIllustration}
                illustrationSize={{ width: 130, height: 118 }}
                title="Who shares this money?"
                desc="Add your partner, or anyone you budget with, so you can both log spending and see the same numbers. Each person gets an email invite. Just you? Skip ahead."
              />
              <ListGroup>
                {(members.data ?? []).map((m) => {
                  const isMe = m.account_id === session?.user.id;
                  return (
                    <ListRow
                      key={m.id}
                      emoji={<AvatarGlyph value={m.avatar} size={40} />}
                      title={isMe ? `${m.name} (you)` : m.name}
                      subtitle={
                        isMe
                          ? 'You'
                          : m.invite_pending
                            ? `Invite sent to ${m.invite_email ?? 'their email'}`
                            : m.has_account
                              ? 'Joined'
                              : 'Added'
                      }
                    />
                  );
                })}
              </ListGroup>
              <AddButton label="Add a person" onPress={() => setAddingMember(true)} />
            </View>
          )}

          {step === 1 && (
            <View>
              <StepHeader
                illustration={IncomeIllustration}
                illustrationSize={{ width: 127, height: 130 }}
                title="What comes in each month?"
                desc="Add each regular paycheck and who earns it. Everything else is worked out from this, so it's the one step not to skip."
              />
              {noIncome ? (
                <EmptyCard
                  emoji={<IconGiftBox width={26} height={26} color={Palette.sageDeep} />}
                  text="No income added yet."
                  cta="Add a paycheck"
                  onPress={() => openIncomeSheet(null)}
                />
              ) : (
                <>
                  <ListGroup>
                    {(income.data ?? []).map((s) => {
                      const m = memberById(s.member_id);
                      return (
                        <ListRow
                          key={s.id}
                          emoji={
                            m ? (
                              <AvatarGlyph value={m.avatar} size={40} />
                            ) : (
                              <IconGiftBox width={22} height={22} color={Palette.sageDeep} />
                            )
                          }
                          title={m?.name ?? 'Household'}
                          subtitle={`${fmt(s.amount)} · ${FREQ[s.frequency].label}`}
                          onPress={() => openIncomeSheet({ kind: 'recurring', source: s })}
                          right={
                            <ThemedText type="bodyBold">{fmt(Math.round(monthlyEquiv(s)))}/mo</ThemedText>
                          }
                        />
                      );
                    })}
                  </ListGroup>
                  <AddButton label="Add another paycheck" onPress={() => openIncomeSheet(null)} />
                </>
              )}
              <TotalCard label="Comes in each month" value={fmt(budget.totalIncome)} tone="sage" />
            </View>
          )}

          {step === 2 && (
            <View>
              <StepHeader
                illustration={FixedExpensesIllustration}
                illustrationSize={{ width: 130, height: 99 }}
                title="What bills come out every month?"
                desc="Rent or mortgage, loans, utilities, subscriptions. These come off the top before your weekly money is worked out. Close enough is fine: you can change them anytime."
              />
              {(bills.data ?? []).length === 0 ? (
                <EmptyCard
                  emoji={<IconBills width={26} height={26} color={Palette.ink} />}
                  text="No bills added yet."
                  cta="Add a bill"
                  onPress={() => setBillSheet({ bill: null })}
                />
              ) : (
                <>
                  <ListGroup>
                    {(bills.data ?? []).map((b) => (
                      <ListRow
                        key={b.id}
                        emoji={<CategoryGlyph billCategory={b.category} emoji={billEmoji(b.category)} />}
                        title={b.name}
                        subtitle={`${b.category} · due the ${ordinal(dueDayInMonth(b.due_day, todayISO()) ?? 0)}`}
                        onPress={() => setBillSheet({ bill: b })}
                        right={
                          <ThemedText type="bodyBold">{b.amount != null ? fmt(b.amount) : 'Varies'}</ThemedText>
                        }
                      />
                    ))}
                  </ListGroup>
                  <AddButton label="Add another bill" onPress={() => setBillSheet({ bill: null })} />
                </>
              )}
              <TotalCard label="Bills each month" value={fmt(budget.totalFixed)} tone="terracotta" />
            </View>
          )}

          {step === 3 && (
            <View>
              <StepHeader
                illustration={SavingsGoalsIllustration}
                illustrationSize={{ width: 116, height: 140 }}
                title="Saving toward anything?"
                desc="Optional. Set a target and how much to put in each month. That amount comes off before your weekly money is worked out, so saving happens without you having to think about it."
              />
              {(goals.data ?? []).length === 0 ? (
                <EmptyCard
                  emoji={<GoalGlyph emoji={null} />}
                  text="No goals yet. This one's optional."
                  cta="Add a savings goal"
                  onPress={() => setGoalSheet({ goal: null })}
                />
              ) : (
                <>
                  <ListGroup>
                    {(goals.data ?? []).map((g) => (
                      <ListRow
                        key={g.id}
                        emoji={<GoalGlyph emoji={g.emoji} />}
                        title={g.name}
                        subtitle={`${fmt(g.monthly_amount)} a month toward ${fmt(g.target_amount)}`}
                        onPress={() => setGoalSheet({ goal: g })}
                      />
                    ))}
                  </ListGroup>
                  <AddButton label="Add another goal" onPress={() => setGoalSheet({ goal: null })} />
                </>
              )}
            </View>
          )}

          {step === 4 && (
            <View>
              <StepHeader
                illustration={ReviewIllustration}
                illustrationSize={{ width: 127, height: 130 }}
                title="Your weekly spending money"
                desc="What each week starts with for everything that isn't a bill or a goal: groceries, gas, eating out and the rest."
              />
              {noIncome ? (
                <Card style={styles.warnCard}>
                  <ThemedText type="bodyBold">Add your income first</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Your weekly money is worked out from what comes in, so without any income it
                    comes to $0.
                  </ThemedText>
                  <Button title="Back to income" onPress={() => setStep(1)} style={styles.warnBtn} />
                </Card>
              ) : (
                <>
                  <View style={styles.reveal}>
                    <ThemedText
                      type="display"
                      style={[styles.revealNumber, budget.weeklyAllowance < 0 && styles.revealShort]}>
                      {budget.weeklyAllowance < 0 ? '−' + fmt(-budget.weeklyAllowance) : fmt(budget.weeklyAllowance)}
                    </ThemedText>
                    <ThemedText type="body" themeColor="textSecondary">
                      each week
                    </ThemedText>
                  </View>
                  {/* Bills and goals bigger than income can't be celebrated as a
                      weekly number. Say plainly that the plan doesn't fit. */}
                  {budget.weeklyAllowance < 0 && (
                    <Card style={styles.warnCard}>
                      <ThemedText type="bodyBold" style={styles.revealShort}>
                        Your bills and goals are more than what comes in
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        Check the amounts, lower a savings goal, or add any income that&apos;s
                        missing. You can go back and change anything.
                      </ThemedText>
                    </Card>
                  )}
                  {/* The working, so the number is believable. */}
                  <Card style={styles.reviewCard}>
                    <MoneyRow label="Comes in each month" value={fmt(budget.totalIncome)} strong />
                    <MoneyRow
                      label="Bills"
                      value={less(budget.totalFixed)}
                      sub
                      color={Palette.terracottaDeep}
                    />
                    {budget.goalsMonthly > 0 && (
                      <MoneyRow
                        label="Savings goals"
                        value={less(budget.goalsMonthly)}
                        sub
                        color={Palette.terracottaDeep}
                      />
                    )}
                    {budget.funTotal > 0 && (
                      <MoneyRow
                        label="Fun money"
                        value={less(budget.funTotal)}
                        sub
                        color={Palette.terracottaDeep}
                      />
                    )}
                    <View style={styles.divider} />
                    <MoneyRow
                      label={`Shared across the ${weeks} weeks this month`}
                      value={`${fmt(budget.weeklyAllowance)} a week`}
                      strong
                      color={Palette.sageDeep}
                    />
                  </Card>
                </>
              )}
            </View>
          )}

          {step === 5 && (
            <View>
              <StepHeader
                illustration={PlannedSpendingIllustration}
                illustrationSize={{ width: 130, height: 118 }}
                title="Set aside your weekly regulars"
                desc={`Optional. Things you buy every week, like groceries and gas, can be set aside from your ${fmt(budget.weeklyAllowance)} so they're never spent by accident. What's left is free to spend.`}
              />
              <PlannedSpending householdId={householdId} />
              <Card style={styles.reviewCard}>
                <MoneyRow label="Weekly spending money" value={fmt(budget.weeklyAllowance)} />
                <MoneyRow
                  label="Planned spending"
                  value={less(plannedWeekly)}
                  sub
                  color={Palette.terracottaDeep}
                />
                <View style={styles.divider} />
                <MoneyRow
                  label="Free to spend each week"
                  value={fmt(freeWeekly)}
                  strong
                  color={freeWeekly < 0 ? Palette.terracottaDeep : Palette.sageDeep}
                />
              </Card>
              <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
                That&apos;s the number your Week screen starts from. You can change any of this later
                in Setup.
              </ThemedText>
            </View>
          )}
        </ScrollView>

        {/* Footer nav */}
        <View style={styles.footer}>
          {step > 0 && (
            <Pressable accessibilityRole="button" onPress={() => setStep((s) => s - 1)} style={styles.backBtn}>
              <ThemedText type="bodyBold">Back</ThemedText>
            </Pressable>
          )}
          <View style={styles.flex}>
            <Button title={step === STEPS.length - 1 ? 'Finish setup' : 'Continue'} onPress={next} />
          </View>
        </View>
      </View>

      <AddMemberSheet
        visible={addingMember}
        onClose={() => setAddingMember(false)}
        onAdd={addMember}
        saving={memberMut.add.isPending}
      />
      <IncomeSheet
        visible={incomeSheetOpen}
        target={incomeTarget}
        members={members.data ?? []}
        onClose={closeIncomeSheet}
        onSave={saveIncome}
        onDelete={deleteIncome}
        saving={incomeMut.create.isPending || incomeMut.update.isPending}
        allowOneOff={false}
      />
      <BillSheet
        visible={!!billSheet}
        bill={billSheet?.bill ?? null}
        onClose={() => setBillSheet(null)}
        onSave={saveBill}
        onDelete={deleteBill}
        saving={billMut.create.isPending || billMut.update.isPending}
      />
      <GoalSheet
        visible={!!goalSheet}
        goal={goalSheet?.goal ?? null}
        onClose={() => setGoalSheet(null)}
        onSave={saveGoal}
        onDelete={deleteGoal}
        saving={goalMut.create.isPending || goalMut.update.isPending}
      />
    </ThemedView>
  );
}

function StepHeader({
  illustration: Illustration,
  illustrationSize: { width, height } = { width: 130, height: 130 },
  title,
  desc,
}: {
  illustration: ComponentType<SvgProps>;
  illustrationSize?: { width: number; height: number };
  title: string;
  desc: string;
}) {
  return (
    <View style={styles.stepHeader}>
      <Illustration width={width} height={height} style={styles.stepIllustration} />
      <ThemedText type="subtitle">{title}</ThemedText>
      <ThemedText type="body" themeColor="textSecondary" style={styles.stepDesc}>
        {desc}
      </ThemedText>
    </View>
  );
}

function EmptyCard({
  emoji,
  text,
  cta,
  onPress,
}: {
  emoji: ReactNode;
  text: string;
  cta: string;
  onPress: () => void;
}) {
  return (
    <Card style={styles.emptyCard}>
      {typeof emoji === 'string' ? <ThemedText type="subtitle">{emoji}</ThemedText> : emoji}
      <ThemedText type="body" themeColor="textSecondary" style={styles.emptyText}>
        {text}
      </ThemedText>
      <Button title={cta} onPress={onPress} style={styles.emptyBtn} />
    </Card>
  );
}

/** An amount being taken off, written "−$1,500"; nothing taken off is just "$0", not "−$0". */
const less = (n: number) => (n > 0 ? '−' + fmt(n) : fmt(0));

/** A plain secondary button under a list: "Add another bill". */
function AddButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <Button variant="secondary" title={label} onPress={onPress} style={styles.addBtn} />;
}

function TotalCard({ label, value, tone }: { label: string; value: string; tone: 'sage' | 'terracotta' }) {
  const sage = tone === 'sage';
  return (
    <View
      style={[styles.totalCard, { backgroundColor: sage ? 'rgba(129,178,154,0.16)' : 'rgba(224,122,95,0.12)' }]}>
      <ThemedText type="bodyBold" style={{ color: sage ? Palette.sageDeep : Palette.terracottaDeep }}>
        {label}
      </ThemedText>
      <ThemedText type="subtitle" style={{ color: sage ? Palette.sageDeep : Palette.terracottaDeep }}>
        {value}
      </ThemedText>
    </View>
  );
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
  skip: { color: Palette.sageDeep },
  progressRow: { flexDirection: 'row', gap: Spacing.one + 2 },
  progressSeg: { flex: 1, height: 5, borderRadius: Radius.pill, backgroundColor: 'rgba(61,64,91,0.12)' },
  progressOn: { backgroundColor: Palette.sage },
  body: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two, paddingBottom: Spacing.five },

  stepHeader: { marginBottom: Spacing.three },
  stepIllustration: { alignSelf: 'center', marginTop: Spacing.four, marginBottom: Spacing.four },
  stepDesc: { marginTop: Spacing.two, lineHeight: 22 },

  emptyCard: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.four, marginBottom: Spacing.three },
  emptyText: { textAlign: 'center' },
  emptyBtn: { alignSelf: 'stretch', marginTop: Spacing.two },
  addBtn: { borderWidth: 1, borderColor: 'rgba(61,64,91,0.18)', marginBottom: Spacing.three },
  note: { textAlign: 'center', marginTop: Spacing.three, lineHeight: 22 },
  totalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Radius.large,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },

  reveal: { alignItems: 'center', marginBottom: Spacing.three },
  revealNumber: { color: Palette.sageDeep },
  revealShort: { color: Palette.terracottaDeep },
  reviewCard: { paddingVertical: Spacing.two, marginTop: Spacing.two },
  warnCard: { gap: Spacing.two },
  warnBtn: { marginTop: Spacing.one },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(61,64,91,0.15)',
    marginVertical: Spacing.two,
  },

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
