import { useRouter } from 'expo-router';
import { ChevronRight, Plus, X } from 'lucide-react-native';
import type { ComponentType, ReactNode } from 'react';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SvgProps } from 'react-native-svg';

import IllustrationFixedExpenses from '@/assets/illustrations/onboarding-fixed-expenses.svg';
import IllustrationHousehold from '@/assets/illustrations/onboarding-household.svg';
import IllustrationIncome from '@/assets/illustrations/onboarding-income.svg';
import IllustrationPlannedSpending from '@/assets/illustrations/onboarding-planned-spending.svg';
import IllustrationReview from '@/assets/illustrations/onboarding-review.svg';
import IllustrationSavingsGoals from '@/assets/illustrations/onboarding-savings-goals.svg';
import IllustrationWelcome from '@/assets/illustrations/onboarding-welcome.svg';
import { AddMemberSheet } from '@/components/add-member-sheet';
import { AvatarGlyph } from '@/components/avatar-glyph';
import { BillSheet } from '@/components/bill-sheet';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { CategoryGlyph } from '@/components/category-glyph';
import { GoalGlyph } from '@/components/goal-glyph';
import { GoalSheet } from '@/components/goal-sheet';
import { IncomeSheet, type IncomeDraft } from '@/components/income-sheet';
import { ListRow } from '@/components/list-row';
import { MoneyRow } from '@/components/money-row';
import { PlannedSpending } from '@/components/planned-spending';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WeekStartPicker } from '@/components/week-start-picker';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { billEmoji } from '@/lib/categories';
import { ordinal } from '@/lib/format';
import { useHousehold } from '@/lib/household';
import { computeBudget, fmt, monthlyEquiv } from '@/lib/money';
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
  useHouseholdMutations,
  useIncome,
  useIncomeMutations,
  sendInvite,
  useMemberMutations,
  useMembers,
  type BillInput,
  type GoalInput,
  type NewMemberInput,
} from '@/lib/queries';
import type { Bill, Goal, IncomeSource } from '@/lib/types';
import { weekdayName } from '@/lib/week';

const STEPS = [
  'Welcome',
  'Household',
  'Income',
  'Fixed expenses',
  'Savings goals',
  'Planned spending',
  'Review',
];

export default function OnboardingScreen() {
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
  const billMut = useBillMutations(householdId);
  const goalMut = useGoalMutations(householdId);
  const memberMut = useMemberMutations(householdId);
  const householdMut = useHouseholdMutations(householdId);
  const completeOnboarding = useCompleteOnboarding(session?.user.id ?? null);

  const [step, setStep] = useState(0);
  const [incomeSheet, setIncomeSheet] = useState<{ source: IncomeSource | null } | null>(null);
  const [billSheet, setBillSheet] = useState<{ bill: Bill | null } | null>(null);
  const [goalSheet, setGoalSheet] = useState<{ goal: Goal | null } | null>(null);
  const [addingMember, setAddingMember] = useState(false);

  const budget = computeBudget({
    incomeSources: income.data ?? [],
    extraIncome: extraIncome.data ?? [],
    bills: bills.data ?? [],
    goals: goals.data ?? [],
    funMoneyEnabled: funSettings.data?.enabled ?? false,
    funPeople: funPeople.data ?? [],
  });

  const memberById = (id: string | null) => (members.data ?? []).find((m) => m.id === id) ?? null;

  function saveIncome(draft: IncomeDraft, id?: string) {
    if (id) incomeMut.update.mutate({ id, ...draft });
    else incomeMut.create.mutate(draft);
    setIncomeSheet(null);
  }
  function deleteIncome(id: string) {
    incomeMut.remove.mutate(id);
    setIncomeSheet(null);
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
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        {/* Progress header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <ThemedText type="label" themeColor="textSecondary">
              Step {step + 1} of {STEPS.length} · {STEPS[step]}
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close setup"
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
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {step === 0 && <Welcome />}

          {step === 1 && (
            <View>
              <StepHeader
                illustration={IllustrationHousehold}
                illustrationSize={{ width: 130, height: 118 }}
                title="Who's in your household?"
                desc="Add the people you share money with — a partner, roommates, or kids. You'll be able to set who earns what and give each person a fun-money stash."
              />
              {(members.data ?? []).map((m) => (
                <ListRow
                  key={m.id}
                  emoji={<AvatarGlyph value={m.avatar} size={44} />}
                  title={m.account_id === session?.user.id ? `${m.name} (you)` : m.name}
                  subtitle={m.is_admin ? 'Admin' : m.invite_pending ? `Invite sent · ${m.invite_email ?? ''}` : m.has_account ? 'Member' : 'Fun money only'}
                />
              ))}
              <DashedAdd label="Add a household member" onPress={() => setAddingMember(true)} />

              <View style={styles.weekBlock}>
                <ThemedText type="bodyBold">When does your week start?</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.weekNote}>
                  Your weekly spending resets each {weekdayName(household?.week_start_day ?? 0)}.
                </ThemedText>
                <WeekStartPicker
                  value={household?.week_start_day ?? 0}
                  onChange={(d) => householdMut.setWeekStart.mutate(d)}
                />
              </View>
            </View>
          )}

          {step === 2 && (
            <View>
              <StepHeader
                illustration={IllustrationIncome}
                illustrationSize={{ width: 127, height: 130 }}
                title="What comes in?"
                desc="This is the foundation — your weekly allowance, savings goals, and fun money are all calculated from this number. Add every regular paycheck. Tap any entry to edit it."
              />
              {(income.data ?? []).map((s) => {
                const m = memberById(s.member_id);
                return (
                  <ListRow
                    key={s.id}
                    emoji={m ? <AvatarGlyph value={m.avatar} size={44} /> : '💵'}
                    title={m?.name ?? 'Household'}
                    subtitle={`${fmt(s.amount)} · ${s.frequency === 'semimonthly' ? 'Twice a month' : 'Monthly'}`}
                    onPress={() => setIncomeSheet({ source: s })}
                    right={
                      <View style={styles.rightRow}>
                        <ThemedText type="bodyBold">{fmt(Math.round(monthlyEquiv(s)))}</ThemedText>
                        <ChevronRight size={16} color="#B7B8C4" />
                      </View>
                    }
                  />
                );
              })}
              {(income.data ?? []).length === 0 ? (
                <EmptyCard emoji="💵" text="No income added yet." cta="Add income" onPress={() => setIncomeSheet({ source: null })} />
              ) : (
                <DashedAdd label="Add another income source" onPress={() => setIncomeSheet({ source: null })} />
              )}
              <TotalCard label="Total monthly income" value={fmt(budget.totalIncome)} tone="sage" />
            </View>
          )}

          {step === 3 && (
            <View>
              <StepHeader
                illustration={IllustrationFixedExpenses}
                illustrationSize={{ width: 130, height: 99 }}
                title="What's already spoken for?"
                desc="Add the bills that come out no matter what — rent or mortgage, loans, utilities, subscriptions. We set this aside before figuring your weekly spending money."
              />
              {(bills.data ?? []).length === 0 ? (
                <EmptyCard emoji="🧾" text="No bills added yet." cta="Add a bill" onPress={() => setBillSheet({ bill: null })} />
              ) : (
                <>
                  <DashedAdd label="Add another bill" onPress={() => setBillSheet({ bill: null })} />
                  {(bills.data ?? []).map((b) => (
                    <ListRow
                      key={b.id}
                      emoji={<CategoryGlyph billCategory={b.category} emoji={billEmoji(b.category)} />}
                      title={b.name}
                      subtitle={`${b.category} · due the ${ordinal(b.due_day ?? 0)}`}
                      onPress={() => setBillSheet({ bill: b })}
                      right={
                        <View style={styles.rightRow}>
                          <ThemedText type="bodyBold">{b.amount != null ? fmt(b.amount) : '—'}</ThemedText>
                          <ChevronRight size={16} color="#B7B8C4" />
                        </View>
                      }
                    />
                  ))}
                </>
              )}
              <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
                Don&apos;t worry about getting every bill exactly right — tap one to edit or remove it, and you can always add more later from Setup.
              </ThemedText>
              <TotalCard label="Total fixed expenses" value={fmt(budget.totalFixed)} tone="terracotta" />
            </View>
          )}

          {step === 4 && (
            <View>
              <StepHeader
                illustration={IllustrationSavingsGoals}
                illustrationSize={{ width: 116, height: 140 }}
                title="What are you saving toward?"
                desc="Optional, but this is how consistent saving happens automatically — set a target and a monthly amount, and we fold it into your budget before the weekly number is calculated."
              />
              {(goals.data ?? []).map((g) => (
                <ListRow
                  key={g.id}
                  emoji={<GoalGlyph emoji={g.emoji} />}
                  title={g.name}
                  subtitle={`${fmt(g.monthly_amount)}/mo toward ${fmt(g.target_amount)}`}
                  onPress={() => setGoalSheet({ goal: g })}
                  right={<ChevronRight size={16} color="#B7B8C4" />}
                />
              ))}
              {(goals.data ?? []).length === 0 ? (
                <EmptyCard emoji={<GoalGlyph emoji={null} />} text="No goals yet — totally optional." cta="Add a savings goal" onPress={() => setGoalSheet({ goal: null })} />
              ) : (
                <DashedAdd label="Add another goal" onPress={() => setGoalSheet({ goal: null })} />
              )}
            </View>
          )}

          {step === 5 && (
            <View>
              <StepHeader
                illustration={IllustrationPlannedSpending}
                illustrationSize={{ width: 130, height: 118 }}
                title="What do you spend every week?"
                desc="Optional — set aside your constant weekly costs like groceries and gas. They'll be reserved from your weekly money so your Week screen shows what's truly free to spend after them."
              />
              <PlannedSpending householdId={householdId} />
            </View>
          )}

          {step === 6 && (
            <View>
              <StepHeader
                illustration={IllustrationReview}
                illustrationSize={{ width: 127, height: 130 }}
                title="You're set up"
                desc="Here's how your money breaks down each month, calculated from everything you just entered."
              />
              <Card style={styles.reviewCard}>
                <MoneyRow label="Total income" value={fmt(budget.totalIncome)} strong color={Palette.sageDeep} />
                <Dashed />
                <MoneyRow label="Fixed expenses" value={'−' + fmt(budget.totalFixed)} strong color={Palette.terracottaDeep} />
                <MoneyRow label="Savings goals" value={'−' + fmt(budget.goalsMonthly)} sub color={Palette.terracottaDeep} />
                <MoneyRow label="Fun money" value={'−' + fmt(budget.funTotal)} sub color={Palette.terracottaDeep} />
                <Dashed />
                <MoneyRow label="Weekly allowance" value={fmt(budget.weeklyAllowance)} strong color={Palette.sageDeep} />
              </Card>
              {(envelopes.data ?? []).length > 0 && (
                <ThemedText type="small" themeColor="textSecondary" style={styles.reviewNote}>
                  You&apos;ve planned{' '}
                  {fmt((envelopes.data ?? []).reduce((a, e) => a + e.weekly_amount, 0))}/week across{' '}
                  {(envelopes.data ?? []).length}{' '}
                  {(envelopes.data ?? []).length === 1 ? 'category' : 'categories'} — you&apos;ll see
                  them fill up on your Week screen.
                </ThemedText>
              )}
              <ThemedText type="small" themeColor="textSecondary" style={styles.reviewNote}>
                You can always adjust income, bills, goals, or your week from Setup.
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
            <Button
              title={step === 0 ? "Let's go" : step === STEPS.length - 1 ? 'Finish setup' : 'Continue'}
              onPress={next}
            />
          </View>
        </View>
      </SafeAreaView>

      <AddMemberSheet
        visible={addingMember}
        onClose={() => setAddingMember(false)}
        onAdd={addMember}
        saving={memberMut.add.isPending}
      />
      <IncomeSheet
        visible={!!incomeSheet}
        source={incomeSheet?.source ?? null}
        members={members.data ?? []}
        onClose={() => setIncomeSheet(null)}
        onSave={saveIncome}
        onDelete={deleteIncome}
        saving={incomeMut.create.isPending || incomeMut.update.isPending}
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

function Welcome() {
  return (
    <View style={styles.welcome}>
      <IllustrationWelcome width={150} height={134} style={styles.welcomeIllustration} />
      <ThemedText type="title" style={styles.welcomeTitle}>
        Let&apos;s set up your budget
      </ThemedText>
      <ThemedText type="body" themeColor="textSecondary" style={styles.welcomeDesc}>
        A few quick steps — your household, income, fixed bills, savings goals, then your weekly
        essentials. Each one builds on the last, so your weekly spending number at the end is
        calculated for you automatically.
      </ThemedText>
      <View style={styles.previews}>
        <StepPreview num="1" title="Household" desc="Who you share money with" />
        <StepPreview num="2" title="Income" desc="The foundation everything is calculated from" />
        <StepPreview num="3" title="Fixed expenses" desc="Bills that come out no matter what" />
        <StepPreview num="4" title="Savings goals" desc="What you're setting aside each month" />
        <StepPreview num="5" title="Planned spending" desc="Weekly essentials like groceries and gas" />
      </View>
    </View>
  );
}

function StepPreview({ num, title, desc }: { num: string; title: string; desc: string }) {
  return (
    <View style={styles.preview}>
      <View style={styles.previewNum}>
        <ThemedText type="label" style={styles.previewNumText}>
          {num}
        </ThemedText>
      </View>
      <View style={styles.flex}>
        <ThemedText type="bodyBold">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {desc}
        </ThemedText>
      </View>
    </View>
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

function EmptyCard({ emoji, text, cta, onPress }: { emoji: ReactNode; text: string; cta: string; onPress: () => void }) {
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

function DashedAdd({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.dashedAdd}>
      <View style={styles.plusBadge}>
        <Plus size={16} color={Palette.card} strokeWidth={3} />
      </View>
      <ThemedText type="label">{label}</ThemedText>
    </Pressable>
  );
}

function TotalCard({ label, value, tone }: { label: string; value: string; tone: 'sage' | 'terracotta' }) {
  const sage = tone === 'sage';
  return (
    <View style={[styles.totalCard, { backgroundColor: sage ? 'rgba(129,178,154,0.16)' : 'rgba(224,122,95,0.12)' }]}>
      <ThemedText type="bodyBold" style={{ color: sage ? Palette.sageDeep : Palette.terracottaDeep }}>
        {label}
      </ThemedText>
      <ThemedText type="subtitle" style={{ color: sage ? Palette.sageDeep : Palette.terracottaDeep }}>
        {value}
      </ThemedText>
    </View>
  );
}

function Dashed() {
  return <View style={styles.divider} />;
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
  body: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two, paddingBottom: Spacing.five },
  rightRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },

  // Welcome
  welcome: { alignItems: 'center', paddingTop: Spacing.four },
  welcomeIllustration: { marginBottom: Spacing.three },
  welcomeTitle: { textAlign: 'center', marginBottom: Spacing.two },
  welcomeDesc: { textAlign: 'center', paddingHorizontal: Spacing.two },
  previews: { alignSelf: 'stretch', gap: Spacing.three, marginTop: Spacing.five },
  preview: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  previewNum: {
    width: 34,
    height: 34,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(129,178,154,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewNumText: { color: Palette.sageDeep },

  // Step header
  stepHeader: { marginBottom: Spacing.three },
  stepIllustration: { alignSelf: 'center', marginTop: Spacing.four, marginBottom: Spacing.four },
  stepDesc: { marginTop: Spacing.two, lineHeight: 22 },

  // Household step
  weekBlock: { marginTop: Spacing.four, gap: Spacing.one },
  weekNote: { marginBottom: Spacing.two },

  // Empty / dashed / totals
  emptyCard: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.four },
  emptyText: { textAlign: 'center' },
  emptyBtn: { alignSelf: 'stretch', marginTop: Spacing.two },
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
    marginBottom: Spacing.two + 2,
  },
  plusBadge: {
    width: 26,
    height: 26,
    borderRadius: Radius.pill,
    backgroundColor: Palette.sageDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: { textAlign: 'center', marginTop: Spacing.one, marginBottom: Spacing.three, lineHeight: 18 },
  totalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Radius.large,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    marginTop: Spacing.two,
  },

  // Review
  reviewCard: { paddingVertical: Spacing.two },
  reviewNote: { textAlign: 'center', marginTop: Spacing.three, lineHeight: 18 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(61,64,91,0.15)',
    marginVertical: Spacing.two,
  },

  // Footer
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
