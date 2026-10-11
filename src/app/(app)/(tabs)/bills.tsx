import { Check } from 'lucide-react-native';
import { useMemo, useRef, useState, type RefObject } from 'react';
import { ActivityIndicator, findNodeHandle, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LayoutAnimationConfig,
  LinearTransition,
  ZoomIn,
} from 'react-native-reanimated';

import IconSave from '@/assets/icons/icon-save.svg';
import IconRestart from '@/assets/icons/icon-restart.svg';
import IconLifeBuoy from '@/assets/icons/icon-life-buoy.svg';
import { BillDetailSheet } from '@/components/bill-detail-sheet';
import { BillSheet } from '@/components/bill-sheet';
import { CatchUpSheet } from '@/components/catch-up-sheet';
import { EmergencyFundSheet } from '@/components/emergency-fund-sheet';
import { CategoryGlyph } from '@/components/category-glyph';
import { ConfirmDialog, type ConfirmState } from '@/components/confirm-dialog';
import { GoalDetailSheet } from '@/components/goal-detail-sheet';
import { GoalGlyph } from '@/components/goal-glyph';
import { GoalSheet } from '@/components/goal-sheet';
import { HeroCard } from '@/components/hero-card';
import { ListGroup } from '@/components/list-group';
import { ListRow } from '@/components/list-row';
import { MiniCard, TwoUp } from '@/components/mini-card';
import { LoadError } from '@/components/load-error';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SectionHeader } from '@/components/section-header';
import { ThemedText } from '@/components/themed-text';
import { ProgressFill } from '@/components/progress-fill';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { billEmoji } from '@/lib/categories';
import { ordinal, shortDate } from '@/lib/format';
import { useHousehold } from '@/lib/household';
import { balanceFromEntries, billMonthlyCost, catchUpBalance, fmt, goalProgress } from '@/lib/money';
import { monthLabel } from '@/lib/month-review';
import { monthOf, dueDayInMonth } from '@/lib/period';
import {
  useBillCarryovers,
  useBillMutations,
  useBills,
  useCatchUpEntries,
  useEmergencyFund,
  useEmergencyFundMutations,
  useGoalMutations,
  useGoals,
  useMembers,
  useResolveCarryover,
  type BillInput,
  type GoalInput,
} from '@/lib/queries';
import { useToday } from '@/hooks/use-today';
import { useSession } from '@/lib/auth';
import type { Bill, Goal } from '@/lib/types';
import { haptic } from '@/lib/haptics';
import { showToast } from '@/lib/toast';
import { screenData } from '@/lib/screen-data';

/** " · est. $421" when a paid bill came in different from what it was budgeted
 *  at — the card leads with what was actually paid, but the estimate is still
 *  worth showing so the gap isn't silent. */
function estimateNote(bill: Bill): string {
  if (!bill.paid || bill.amount == null || bill.paid_amount == null) return '';
  if (bill.paid_amount === bill.amount) return '';
  return ` · est. ${fmt(bill.amount)}`;
}

export default function BillsScreen() {
  // These were module-level consts, which froze "today" for the whole JS
  // runtime: overdue bills stayed overdue-as-of-launch-day and the header kept
  // last month's name until the app was force-quit.
  const today = useToday();
  const headerMonth = monthLabel(monthOf(today));
  const todayDay = Number(today.slice(8, 10));

  const { householdId } = useHousehold();
  const { session } = useSession();
  const bills = useBills(householdId);
  const goals = useGoals(householdId);
  const members = useMembers(householdId);
  const carryovers = useBillCarryovers(householdId);
  const billMut = useBillMutations(householdId);
  const goalMut = useGoalMutations(householdId);
  const resolveCarryover = useResolveCarryover(householdId);
  const catchUp = useCatchUpEntries(householdId);
  const catchUpOwed = catchUpBalance(catchUp.data);
  const fund = useEmergencyFund(householdId);
  const fundMut = useEmergencyFundMutations(householdId);
  const fundBalance = balanceFromEntries(fund.data);

  const [billSheet, setBillSheet] = useState<{ bill: Bill | null } | null>(null);
  const [goalSheet, setGoalSheet] = useState<{ goal: Goal | null } | null>(null);
  const [billDetail, setBillDetail] = useState<Bill | null>(null);
  const [goalDetail, setGoalDetail] = useState<Goal | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [catchUpOpen, setCatchUpOpen] = useState(false);
  const [fundOpen, setFundOpen] = useState(false);

  const currentMemberId = useMemo(() => {
    const uid = session?.user.id;
    return (members.data ?? []).find((m) => m.account_id === uid)?.id ?? null;
  }, [members.data, session?.user.id]);

  const memberName = (id: string | null) =>
    (members.data ?? []).find((m) => m.id === id)?.name ?? null;

  const scrollRef = useRef<ScrollView>(null);
  const firstOverdueRef = useRef<View>(null);
  const dueSoonRef = useRef<View>(null);
  function scrollToOverdue() {
    scrollToGroup(firstOverdueRef);
  }
  function scrollToGroup(ref: RefObject<View | null>) {
    const node = findNodeHandle(scrollRef.current);
    if (node == null) return;
    ref.current?.measureLayout(
      node,
      (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true }),
      () => {}
    );
  }

  const billList = bills.data ?? [];
  const paid = billList.filter((b) => b.paid);
  // Due days as they fall this month, so "the 31st" means the last day of a
  // shorter month (see dueDayInMonth).
  const due = (b: Bill) => dueDayInMonth(b.due_day, today) ?? 99;
  const overdue = billList.filter((b) => !b.paid && due(b) < todayDay);
  const dueSoon = billList.filter(
    (b) => !b.paid && due(b) >= todayDay && due(b) <= todayDay + 7
  );
  const frac = billList.length ? paid.length / billList.length : 0;
  const paidTotal = paid.reduce((a, b) => a + billMonthlyCost(b), 0);
  const billsTotal = billList.reduce((a, b) => a + billMonthlyCost(b), 0);

  // Grouped by what needs doing, not by category: most categories held a
  // single bill, so the screen was mostly headings. Due date is what someone
  // checking their bills actually asks about.
  const byDue = (a: Bill, b: Bill) => due(a) - due(b);
  const billGroups = [
    { key: 'overdue', title: 'Overdue', bills: [...overdue].sort(byDue) },
    { key: 'soon', title: 'Due in the next 7 days', bills: [...dueSoon].sort(byDue) },
    {
      key: 'later',
      title: 'Later this month',
      bills: billList
        .filter((b) => !b.paid && !overdue.includes(b) && !dueSoon.includes(b))
        .sort(byDue),
    },
    { key: 'paid', title: 'Paid', bills: [...paid].sort(byDue) },
  ].filter((g) => g.bills.length > 0);

  // Without the failure check a failed fetch showed an empty bill list, which
  // reads as "you have no bills" rather than "this didn't load".
  const {
    loading,
    failed: loadFailed,
    retry: retryLoad,
  } = screenData(householdId, [bills, goals, members, carryovers, catchUp, fund]);

  // ---- bill handlers ----
  function saveBill(input: BillInput, id?: string) {
    if (id) billMut.update.mutate({ id, ...input });
    else billMut.create.mutate(input);
    setBillSheet(null);
    setBillDetail(null);
  }
  function askDeleteBill(id: string) {
    const b = billList.find((x) => x.id === id);
    setBillSheet(null);
    setBillDetail(null);
    setConfirm({
      title: 'Delete this bill?',
      message: `This removes "${b?.name ?? 'this bill'}" from your bill list entirely.`,
      onConfirm: () => billMut.remove.mutate(id),
    });
  }
  function confirmPay(bill: Bill, amount: number) {
    billMut.markPaid.mutate(
      { id: bill.id, paidAmount: amount, paidByMemberId: currentMemberId },
      { onSuccess: haptic.success }
    );
    setBillDetail(null);
  }

  // ---- carryover handlers (bills unpaid when a prior month closed) ----
  function markCarryoverPaid(id: string, amount: number | null) {
    // markPaid is explicit — a varies-amount bill (amount null) still counts as
    // genuinely paid rather than being mistaken for a dismissal.
    resolveCarryover.mutate(
      { id, markPaid: true, paidAmount: amount, settledByMemberId: currentMemberId },
      { onSuccess: haptic.success }
    );
  }
  function dismissCarryover(id: string) {
    resolveCarryover.mutate({ id, markPaid: false, settledByMemberId: currentMemberId });
  }

  // ---- goal handlers ----
  function saveGoal(input: GoalInput, id?: string) {
    if (id) goalMut.update.mutate({ id, ...input });
    else goalMut.create.mutate(input);
    setGoalSheet(null);
    setGoalDetail(null);
  }
  function askDeleteGoal(id: string) {
    const g = goals.data?.find((x) => x.id === id);
    setGoalSheet(null);
    setGoalDetail(null);
    setConfirm({
      title: 'Delete this goal?',
      message: `This removes "${g?.name ?? 'this goal'}" and its saved progress (${fmt(g?.saved_amount ?? 0)}) from tracking.`,
      onConfirm: () => goalMut.remove.mutate(id),
    });
  }
  function contribute(g: Goal) {
    goalMut.contribute.mutate(
      { id: g.id },
      {
        // Null means the database added nothing: this month was already paid,
        // probably from another phone. Say so rather than buzz success.
        onSuccess: (saved) =>
          saved == null ? showToast('Already marked paid this month.', 'info') : haptic.success(),
      }
    );
    setGoalDetail(null);
  }

  return (
    <Screen scrollRef={scrollRef}>
      <ScreenHeader eyebrow={headerMonth} title="Bills" />

      {loading ? (
        <ActivityIndicator color={Palette.sageDeep} style={styles.loading} />
      ) : loadFailed ? (
        <LoadError onRetry={retryLoad} what="your bills" />
      ) : (
        // Rows that change while the screen is open animate (a bill paid
        // sliding to the bottom of its group, a goal added); the first load
        // doesn't, so the screen never cascades in.
        <LayoutAnimationConfig skipEntering>
          <HeroCard
            eyebrow="Bills paid this month"
            big={`${paid.length} of ${billList.length}`}
            bigValue={paid.length}
            formatBig={(n) => `${Math.round(n)} of ${billList.length}`}
            // Another household's count isn't a change to this one.
            jumpKey={householdId ?? undefined}
            sub="paid"
            // "of $6,631" mixes real paid amounts with estimates for the bills
            // that haven't come in yet. Calling the total "expected" says so
            // without a second line.
            sub2={`${fmt(paidTotal)} paid of ${fmt(billsTotal)} expected`}
            ringValue={frac}
            ringLabel="done"
          />

          {(overdue.length > 0 || dueSoon.length > 0) && (
            <TwoUp>
              <MiniCard
                label="Overdue"
                hint="due date has passed"
                warn={overdue.length > 0}
                onPress={overdue.length ? scrollToOverdue : undefined}>
                <ThemedText type="title" style={{ color: overdue.length ? Palette.terracotta : Palette.ink }}>
                  {overdue.length}
                </ThemedText>
              </MiniCard>
              {/* Not the budget week: this counts due dates in the next 7 days
                  from today, which is what someone checking their balance
                  actually wants to know. */}
              {/* Both cards jump to their bills. Only Overdue used to, so one
                  tapped and the other, identical-looking, didn't. */}
              <MiniCard
                label="Due soon"
                hint="in the next 7 days"
                onPress={dueSoon.length ? () => scrollToGroup(dueSoonRef) : undefined}>
                <ThemedText type="title">{dueSoon.length}</ThemedText>
              </MiniCard>
            </TwoUp>
          )}

          {/* Bills still unpaid when a prior month closed — separate from this
              month's fresh bills below, so the two never get confused. */}
          {(carryovers.data ?? []).length > 0 && (
            <>
              <SectionHeader title="Unpaid from last month" />
              <ListGroup>
              {(carryovers.data ?? []).map((c) => (
                <ListRow
                  key={c.id}
                  emoji={
                    <CategoryGlyph
                      billCategory={c.category}
                      emoji={billEmoji(c.category)}
                      color={Palette.terracottaDeep}
                    />
                  }
                  title={c.name}
                  subtitle={`Unpaid since ${monthLabel(c.from_month)}`}
                  subColor={Palette.terracotta}
                  outline
                  right={
                    <View style={styles.right}>
                      <ThemedText type="label">{c.amount != null ? fmt(c.amount) : '—'}</ThemedText>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Mark ${c.name} paid`}
                        onPress={() => markCarryoverPaid(c.id, c.amount)}
                        style={styles.paidBadge}>
                        <Check size={13} color={Palette.card} strokeWidth={3} />
                      </Pressable>
                    </View>
                  }
                  footer={
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => dismissCarryover(c.id)}
                      style={styles.dismissRow}>
                      <ThemedText type="small" themeColor="textSecondary">
                        Dismiss without paying
                      </ThemedText>
                    </Pressable>
                  }
                />
              ))}
              </ListGroup>
            </>
          )}

          {/* Bills, grouped by when they're due. */}
          <SectionHeader
            title="Bills this month"
            onAdd={() => setBillSheet({ bill: null })}
            addLabel="Add a bill"
          />
          {billGroups.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.emptyNote}>
              No bills yet. Add the ones that come out every month, like rent, loans and utilities.
            </ThemedText>
          )}
          {billGroups.map((group) => (
            <View
              key={group.key}
              ref={group.key === 'overdue' ? firstOverdueRef : group.key === 'soon' ? dueSoonRef : undefined}
              collapsable={false}>
              <ThemedText
                type="label"
                style={[styles.groupLabel, group.key === 'overdue' && { color: Palette.terracottaDeep }]}
                themeColor={group.key === 'overdue' ? undefined : 'textSecondary'}>
                {group.title}
              </ThemedText>
              <ListGroup>
                {group.bills.map((b) => {
                  const isOverdue = group.key === 'overdue';
                  const who = memberName(b.paid_by_member_id);
                  return (
                    // A bill just paid leaves its group and fades into Paid.
                    <Animated.View
                      key={b.id}
                      entering={FadeIn.duration(220)}
                      exiting={FadeOut.duration(160)}
                      layout={LinearTransition.duration(260)}>
                      <ListRow
                        emoji={
                          <CategoryGlyph
                            billCategory={b.category}
                            emoji={billEmoji(b.category)}
                            color={isOverdue ? Palette.terracottaDeep : undefined}
                          />
                        }
                        title={b.name}
                        subtitle={
                          b.paid
                            ? `Paid${who ? ` by ${who}` : ''}${b.paid_on ? ` · ${shortDate(b.paid_on)}` : ''}${estimateNote(b)}`
                            : `${b.category} · ${isOverdue ? `was due the ${ordinal(due(b))}` : `due the ${ordinal(due(b))}`}`
                        }
                        subColor={isOverdue ? Palette.terracottaDeep : undefined}
                        onPress={() => setBillDetail(b)}
                        outline={isOverdue}
                        dim={b.paid}
                        strikethrough={b.paid}
                        right={
                          <View style={styles.right}>
                            <ThemedText type="label">
                              {b.paid ? fmt(billMonthlyCost(b)) : b.amount != null ? fmt(b.amount) : 'Varies'}
                            </ThemedText>
                            {b.paid && (
                              <Animated.View entering={POP} style={styles.paidBadge}>
                                <Check size={13} color={Palette.card} strokeWidth={3} />
                              </Animated.View>
                            )}
                          </View>
                        }
                      />
                    </Animated.View>
                  );
                })}
              </ListGroup>
            </View>
          ))}

          {/* Savings goals */}
          <SectionHeader
            title="Savings goals"
            icon={<IconSave width={21} height={21} color={Palette.ink} />}
            onAdd={() => setGoalSheet({ goal: null })}
            addLabel="Add a savings goal"
          />
          {(goals.data ?? []).length > 0 ? (
          <ListGroup>
          {(goals.data ?? []).map((g) => {
            const pct = goalProgress(g.saved_amount, g.target_amount);
            const done = g.saved_amount >= g.target_amount;
            const settled = done || g.paid_this_month;
            return (
              <Animated.View
                key={g.id}
                entering={FadeIn.duration(220)}
                exiting={FadeOut.duration(160)}
                layout={LinearTransition.duration(260)}>
              <ListRow
                emoji={<GoalGlyph emoji={g.emoji} />}
                title={g.name}
                subtitle={`${fmt(g.saved_amount)} of ${fmt(g.target_amount)}${done ? ' · funded' : g.paid_this_month ? " · this month's paid" : ''}`}
                subColor={done ? Palette.sageDeep : undefined}
                onPress={() => setGoalDetail(g)}
                dim={settled}
                right={
                  <View style={styles.right}>
                    {!done && <ThemedText type="label">{fmt(g.monthly_amount)}</ThemedText>}
                    {settled && (
                      <Animated.View entering={POP}>
                        <Check size={18} color={Palette.ink} />
                      </Animated.View>
                    )}
                  </View>
                }
                footer={
                  <View style={styles.goalTrack}>
                    <ProgressFill value={pct} style={styles.goalFill} />
                  </View>
                }
              />
              </Animated.View>
            );
          })}
          </ListGroup>
          ) : (
            <ThemedText type="small" themeColor="textSecondary" style={styles.emptyNote}>
              No goals yet. Saving toward something? Tap Add.
            </ThemedText>
          )}

          {/* Emergency fund. Shown once there's something in it, or once the
              household has ever used it, so it never nags an empty app. */}
          {(fundBalance > 0 || (fund.data ?? []).length > 0) && (
            <>
              <SectionHeader
                title="Emergency fund"
                icon={<IconLifeBuoy width={20} height={20} color={Palette.ink} />}
                caption="Money set aside for when something goes wrong. It sits outside your weekly spending."
              />
              <ListGroup>
              <ListRow
                emoji={<IconLifeBuoy width={22} height={22} color={Palette.sageDeep} />}
                title={fundBalance > 0 ? 'Set aside' : 'Nothing set aside yet'}
                subtitle={
                  fundBalance > 0
                    ? 'Tap to take some out, or see where it came from'
                    : 'Send money in from the Week screen to start it'
                }
                onPress={() => setFundOpen(true)}
                right={
                  <ThemedText type="bodyBold" style={{ color: Palette.sageDeep }}>
                    {fmt(fundBalance)}
                  </ThemedText>
                }
              />
              </ListGroup>
            </>
          )}

          {/* Kept after bills and goals, never between them: sitting next to a
              bill made it read as another kind of bill, which is exactly the
              question it kept prompting: is this added to what I owe this
              month? It isn't, and it never was. */}
          {(catchUpOwed > 0 || (catchUp.data ?? []).length > 0) && (
            <>
              <SectionHeader
                title="Catch-up"
                icon={<IconRestart width={20} height={20} color={Palette.ink} />}
                caption="A record of how far past your plan you've gone. It never comes out of your weekly money."
              />
              <ListGroup>
              <ListRow
                emoji={
                  <IconRestart width={22} height={22} color={catchUpOwed > 0 ? Palette.terracottaDeep : Palette.sageDeep} />
                }
                title={catchUpOwed > 0 ? 'Still to make up' : 'All caught up'}
                subtitle={
                  catchUpOwed > 0
                    ? 'Tap to see where it came from and how to bring it down'
                    : 'Nothing outstanding'
                }
                onPress={() => setCatchUpOpen(true)}
                right={
                  <ThemedText
                    type="bodyBold"
                    style={{ color: catchUpOwed > 0 ? Palette.terracottaDeep : Palette.sageDeep }}>
                    {fmt(catchUpOwed)}
                  </ThemedText>
                }
              />
              </ListGroup>
            </>
          )}
        </LayoutAnimationConfig>
      )}

      {/* Sheets */}
      <BillSheet
        visible={!!billSheet}
        bill={billSheet?.bill ?? null}
        onClose={() => setBillSheet(null)}
        onSave={saveBill}
        onDelete={askDeleteBill}
        saving={billMut.create.isPending || billMut.update.isPending}
      />
      <BillDetailSheet
        bill={billDetail}
        paidByName={billDetail ? memberName(billDetail.paid_by_member_id) : null}
        onClose={() => setBillDetail(null)}
        onPay={confirmPay}
        onEdit={(b) => {
          setBillDetail(null);
          setBillSheet({ bill: b });
        }}
        saving={billMut.markPaid.isPending}
      />
      <GoalSheet
        visible={!!goalSheet}
        goal={goalSheet?.goal ?? null}
        onClose={() => setGoalSheet(null)}
        onSave={saveGoal}
        onDelete={askDeleteGoal}
        saving={goalMut.create.isPending || goalMut.update.isPending}
      />
      <GoalDetailSheet
        goal={goalDetail}
        onClose={() => setGoalDetail(null)}
        onContribute={contribute}
        onEdit={(g) => {
          setGoalDetail(null);
          setGoalSheet({ goal: g });
        }}
      />
      <EmergencyFundSheet
        visible={fundOpen}
        balance={fundBalance}
        entries={fund.data ?? []}
        memberName={memberName}
        saving={fundMut.withdraw.isPending}
        onWithdraw={(amount, note) => {
          fundMut.withdraw.mutate({
            amount,
            balance: fundBalance,
            note,
            occurredOn: today,
            memberId: currentMemberId,
          });
          setFundOpen(false);
        }}
        onClose={() => setFundOpen(false)}
      />
      <CatchUpSheet
        visible={catchUpOpen}
        balance={catchUpOwed}
        entries={catchUp.data ?? []}
        memberName={memberName}
        onClose={() => setCatchUpOpen(false)}
      />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </Screen>
  );
}

// The paid check arrives with a small spring, so marking something paid
// lands with a little weight. Reanimated skips it under Reduce Motion.
const POP = ZoomIn.springify().damping(13).stiffness(220);

const styles = StyleSheet.create({
  loading: { marginTop: Spacing.six },
  right: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  groupLabel: { marginBottom: Spacing.two, marginLeft: Spacing.one },
  emptyNote: { marginBottom: Spacing.three },
  paidBadge: {
    width: 22,
    height: 22,
    borderRadius: Radius.pill,
    backgroundColor: Palette.sageDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissRow: { marginTop: Spacing.two },
  goalTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(61,64,91,0.08)',
    overflow: 'hidden',
    marginTop: Spacing.three,
  },
  goalFill: { height: '100%', borderRadius: 999, backgroundColor: Palette.sand },
});
