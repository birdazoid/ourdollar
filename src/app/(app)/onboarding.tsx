import { useRouter } from 'expo-router';
import { ChevronRight, Plus, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BillSheet } from '@/components/bill-sheet';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { IncomeSheet, type IncomeDraft } from '@/components/income-sheet';
import { FieldLabel, TextField } from '@/components/inputs';
import { ListRow } from '@/components/list-row';
import { MoneyRow } from '@/components/money-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { billEmoji, GOAL_EMOJI_OPTIONS } from '@/lib/categories';
import { ordinal } from '@/lib/format';
import { useHousehold } from '@/lib/household';
import { computeBudget, fmt, monthlyEquiv } from '@/lib/money';
import {
  useBillMutations,
  useBills,
  useCompleteOnboarding,
  useExtraIncome,
  useFunPeople,
  useFunSettings,
  useGoalMutations,
  useGoals,
  useIncome,
  useIncomeMutations,
  useMembers,
  type BillInput,
} from '@/lib/queries';
import type { Bill, IncomeSource } from '@/lib/types';

const STEPS = ['Welcome', 'Income', 'Fixed expenses', 'Savings goals', 'Review'];

export default function OnboardingScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { householdId } = useHousehold();

  const members = useMembers(householdId);
  const income = useIncome(householdId);
  const extraIncome = useExtraIncome(householdId);
  const bills = useBills(householdId);
  const goals = useGoals(householdId);
  const funPeople = useFunPeople(householdId);
  const funSettings = useFunSettings(householdId);

  const incomeMut = useIncomeMutations(householdId);
  const billMut = useBillMutations(householdId);
  const goalMut = useGoalMutations(householdId);
  const completeOnboarding = useCompleteOnboarding(session?.user.id ?? null);

  const [step, setStep] = useState(0);
  const [incomeSheet, setIncomeSheet] = useState<{ source: IncomeSource | null } | null>(null);
  const [billSheet, setBillSheet] = useState<{ bill: Bill | null } | null>(null);

  // Inline goal form (step 3).
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalMonthly, setGoalMonthly] = useState('');
  const [goalEmoji, setGoalEmoji] = useState<string>(GOAL_EMOJI_OPTIONS[0]);

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
  function addGoal() {
    const target = Number(goalTarget);
    if (!goalName.trim() || !target) return;
    goalMut.create.mutate({
      name: goalName.trim(),
      emoji: goalEmoji,
      target_amount: target,
      monthly_amount: Number(goalMonthly) || 0,
    });
    setGoalName('');
    setGoalTarget('');
    setGoalMonthly('');
    setGoalEmoji(GOAL_EMOJI_OPTIONS[0]);
  }

  // Finishing (or dismissing) marks onboarding done so it never auto-launches
  // again, then returns to where the user came from (Profile replay) or the
  // now-populated app.
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
                emoji="💰"
                title="What comes in?"
                desc="This is the foundation — your weekly allowance, savings goals, and fun money are all calculated from this number. Add every regular paycheck. Tap any entry to edit or remove it."
              />
              {(income.data ?? []).map((s) => {
                const m = memberById(s.member_id);
                return (
                  <ListRow
                    key={s.id}
                    emoji={m?.avatar ?? '💵'}
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

          {step === 2 && (
            <View>
              <StepHeader
                emoji="🧾"
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
                      emoji={billEmoji(b.category)}
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

          {step === 3 && (
            <View>
              <StepHeader
                emoji="✨"
                title="What are you saving toward?"
                desc="Optional, but this is how consistent saving happens automatically — set a target and a monthly amount, and we fold it into your budget before the weekly number is calculated."
              />
              {(goals.data ?? []).map((g) => (
                <ListRow
                  key={g.id}
                  emoji={g.emoji ?? '🎯'}
                  tileColor="rgba(242,204,143,0.3)"
                  title={g.name}
                  subtitle={`${fmt(g.monthly_amount)}/mo toward ${fmt(g.target_amount)}`}
                />
              ))}
              <Card style={styles.goalForm}>
                <View style={styles.emojiRow}>
                  {GOAL_EMOJI_OPTIONS.map((e) => (
                    <Pressable
                      key={e}
                      accessibilityRole="button"
                      accessibilityLabel={`Goal icon ${e}`}
                      accessibilityState={{ selected: e === goalEmoji }}
                      onPress={() => setGoalEmoji(e)}
                      style={[styles.emojiTile, e === goalEmoji && styles.emojiOn]}>
                      <ThemedText type="body">{e}</ThemedText>
                    </Pressable>
                  ))}
                </View>
                <TextField
                  placeholder="Goal name (e.g. Christmas)"
                  value={goalName}
                  onChangeText={setGoalName}
                  style={styles.goalInput}
                />
                <View style={styles.goalAmounts}>
                  <TextField
                    placeholder="Target $"
                    value={goalTarget}
                    onChangeText={(t) => setGoalTarget(t.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    inputMode="numeric"
                    style={styles.goalAmountInput}
                  />
                  <TextField
                    placeholder="Monthly $"
                    value={goalMonthly}
                    onChangeText={(t) => setGoalMonthly(t.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    inputMode="numeric"
                    style={styles.goalAmountInput}
                  />
                </View>
                <Button
                  title="Add goal"
                  variant="secondary"
                  disabled={!goalName.trim() || !goalTarget}
                  onPress={addGoal}
                  style={styles.addGoalBtn}
                />
              </Card>
            </View>
          )}

          {step === 4 && (
            <View>
              <StepHeader
                emoji="🎉"
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
              <ThemedText type="small" themeColor="textSecondary" style={styles.reviewNote}>
                You can always adjust income, bills, or goals later from Setup.
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
    </ThemedView>
  );
}

function Welcome() {
  return (
    <View style={styles.welcome}>
      <ThemedText type="display" style={styles.welcomeEmoji}>
        👋
      </ThemedText>
      <ThemedText type="title" style={styles.welcomeTitle}>
        Let&apos;s set up your budget
      </ThemedText>
      <ThemedText type="body" themeColor="textSecondary" style={styles.welcomeDesc}>
        Three quick steps — income, fixed bills, then savings goals. Each one builds on the last, so
        your weekly spending number at the end is calculated for you automatically.
      </ThemedText>
      <View style={styles.previews}>
        <StepPreview num="1" title="Income" desc="The foundation everything else is calculated from" />
        <StepPreview num="2" title="Fixed expenses" desc="Bills that come out no matter what" />
        <StepPreview num="3" title="Savings goals" desc="What you're setting aside each month" />
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

function StepHeader({ emoji, title, desc }: { emoji: string; title: string; desc: string }) {
  return (
    <View style={styles.stepHeader}>
      <ThemedText type="title" style={styles.stepEmoji}>
        {emoji}
      </ThemedText>
      <ThemedText type="subtitle">{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.stepDesc}>
        {desc}
      </ThemedText>
    </View>
  );
}

function EmptyCard({ emoji, text, cta, onPress }: { emoji: string; text: string; cta: string; onPress: () => void }) {
  return (
    <Card style={styles.emptyCard}>
      <ThemedText type="subtitle">{emoji}</ThemedText>
      <ThemedText type="body" themeColor="textSecondary" style={styles.emptyText}>
        {text}
      </ThemedText>
      <Pressable accessibilityRole="button" onPress={onPress}>
        <ThemedText type="label" style={{ color: Palette.sageDeep }}>
          {cta}
        </ThemedText>
      </Pressable>
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
  header: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two, paddingBottom: Spacing.two },
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
  welcomeEmoji: { fontSize: 52, lineHeight: 60, marginBottom: Spacing.three },
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
  stepEmoji: { fontSize: 34, lineHeight: 40, marginBottom: Spacing.one },
  stepDesc: { marginTop: Spacing.two, lineHeight: 18 },

  // Empty / dashed / totals
  emptyCard: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five },
  emptyText: { textAlign: 'center' },
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

  // Goal form
  goalForm: { marginTop: Spacing.two, gap: Spacing.two },
  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginBottom: Spacing.one },
  emojiTile: {
    width: 36,
    height: 36,
    borderRadius: Radius.medium,
    backgroundColor: Palette.linen,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  emojiOn: { borderColor: Palette.sage, backgroundColor: 'rgba(129,178,154,0.16)' },
  goalInput: {},
  goalAmounts: { flexDirection: 'row', gap: Spacing.two },
  goalAmountInput: { flex: 1 },
  addGoalBtn: { backgroundColor: 'rgba(129,178,154,0.16)', height: 48, marginTop: Spacing.one },

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
