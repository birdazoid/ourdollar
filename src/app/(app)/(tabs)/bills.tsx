import { Check, ChevronRight, Plus } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, findNodeHandle, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import IconSave from '@/assets/icons/icon-save.svg';
import { BillDetailSheet } from '@/components/bill-detail-sheet';
import { BillSheet } from '@/components/bill-sheet';
import { CategoryGlyph } from '@/components/category-glyph';
import { ConfirmDialog, type ConfirmState } from '@/components/confirm-dialog';
import { GoalDetailSheet } from '@/components/goal-detail-sheet';
import { GoalGlyph } from '@/components/goal-glyph';
import { GoalSheet } from '@/components/goal-sheet';
import { HeroCard } from '@/components/hero-card';
import { ListRow } from '@/components/list-row';
import { MiniCard, TwoUp } from '@/components/mini-card';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SectionHeader } from '@/components/section-header';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { BILL_CATS, billEmoji } from '@/lib/categories';
import { ordinal } from '@/lib/format';
import { useHousehold } from '@/lib/household';
import { billMonthlyCost, fmt } from '@/lib/money';
import { monthLabel } from '@/lib/month-review';
import { monthOf } from '@/lib/period';
import {
  useBillCarryovers,
  useBillMutations,
  useBills,
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

  const [billSheet, setBillSheet] = useState<{ bill: Bill | null } | null>(null);
  const [goalSheet, setGoalSheet] = useState<{ goal: Goal | null } | null>(null);
  const [billDetail, setBillDetail] = useState<Bill | null>(null);
  const [goalDetail, setGoalDetail] = useState<Goal | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const currentMemberId = useMemo(() => {
    const uid = session?.user.id;
    return (members.data ?? []).find((m) => m.account_id === uid)?.id ?? null;
  }, [members.data, session?.user.id]);

  const memberName = (id: string | null) =>
    (members.data ?? []).find((m) => m.id === id)?.name ?? null;

  const scrollRef = useRef<ScrollView>(null);
  const firstOverdueRef = useRef<View>(null);
  function scrollToOverdue() {
    const node = findNodeHandle(scrollRef.current);
    if (node == null) return;
    firstOverdueRef.current?.measureLayout(
      node,
      (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true }),
      () => {}
    );
  }

  const billList = bills.data ?? [];
  const paid = billList.filter((b) => b.paid);
  const overdue = billList.filter((b) => !b.paid && (b.due_day ?? 99) < todayDay);
  const firstOverdueId = overdue[0]?.id ?? null;
  const dueSoon = billList.filter(
    (b) => !b.paid && (b.due_day ?? 99) >= todayDay && (b.due_day ?? 99) <= todayDay + 7
  );
  const frac = billList.length ? paid.length / billList.length : 0;
  const paidTotal = paid.reduce((a, b) => a + billMonthlyCost(b), 0);
  const billsTotal = billList.reduce((a, b) => a + billMonthlyCost(b), 0);

  const grouped = useMemo(() => {
    const byCat: Record<string, Bill[]> = {};
    billList.forEach((b) => {
      (byCat[b.category] = byCat[b.category] || []).push(b);
    });
    Object.values(byCat).forEach((arr) =>
      arr.sort((a, b) => Number(a.paid) - Number(b.paid) || (a.due_day ?? 0) - (b.due_day ?? 0))
    );
    return BILL_CATS.filter((c) => byCat[c]).map((c) => ({ cat: c, bills: byCat[c] }));
  }, [billList]);

  const loading = !householdId || bills.isLoading || goals.isLoading;

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
    billMut.markPaid.mutate({ id: bill.id, paidAmount: amount, paidByMemberId: currentMemberId });
    setBillDetail(null);
  }

  // ---- carryover handlers (bills unpaid when a prior month closed) ----
  function markCarryoverPaid(id: string, amount: number | null) {
    // markPaid is explicit — a varies-amount bill (amount null) still counts as
    // genuinely paid rather than being mistaken for a dismissal.
    resolveCarryover.mutate({ id, markPaid: true, paidAmount: amount, settledByMemberId: currentMemberId });
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
    goalMut.contribute.mutate({
      id: g.id,
      saved_amount: g.saved_amount,
      target_amount: g.target_amount,
      monthly_amount: g.monthly_amount,
    });
    setGoalDetail(null);
  }

  return (
    <Screen scrollRef={scrollRef}>
      <ScreenHeader eyebrow={headerMonth} title="Bills" />

      {loading ? (
        <ActivityIndicator color={Palette.sageDeep} style={styles.loading} />
      ) : (
        <>
          <HeroCard
            eyebrow="Bills paid this month"
            big={`${paid.length} of ${billList.length}`}
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
              <MiniCard label="Due soon" hint="in the next 7 days">
                <ThemedText type="title">{dueSoon.length}</ThemedText>
              </MiniCard>
            </TwoUp>
          )}

          {/* Bills still unpaid when a prior month closed — separate from this
              month's fresh bills below, so the two never get confused. */}
          {(carryovers.data ?? []).length > 0 && (
            <>
              <SectionHeader title="Unpaid from last month" />
              {(carryovers.data ?? []).map((c) => (
                <ListRow
                  key={c.id}
                  emoji={<CategoryGlyph billCategory={c.category} emoji={billEmoji(c.category)} />}
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
            </>
          )}

          <DashedAdd label="Add a bill" onPress={() => setBillSheet({ bill: null })} style={styles.addTop} />

          {/* Savings goals */}
          <SectionHeader title="Savings goals" icon={<IconSave width={21} height={21} color={Palette.ink} />} />
          {(goals.data ?? []).map((g) => {
            const pct = Math.min(1, g.saved_amount / g.target_amount);
            const done = g.saved_amount >= g.target_amount;
            const settled = done || g.paid_this_month;
            return (
              <ListRow
                key={g.id}
                emoji={<GoalGlyph emoji={g.emoji} />}
                title={g.name}
                subtitle={`${fmt(g.saved_amount)} of ${fmt(g.target_amount)}${done ? ' · funded! 🎉' : g.paid_this_month ? " · this month's paid" : ''}`}
                subColor={done ? Palette.sageDeep : undefined}
                onPress={() => setGoalDetail(g)}
                dim={settled}
                right={
                  <View style={styles.right}>
                    {!done && <ThemedText type="label">{fmt(g.monthly_amount)}</ThemedText>}
                    {settled ? <Check size={18} color={Palette.ink} /> : <ChevronRight size={16} color="#B7B8C4" />}
                  </View>
                }
                footer={
                  <View style={styles.goalTrack}>
                    <View style={[styles.goalFill, { width: `${pct * 100}%` }]} />
                  </View>
                }
              />
            );
          })}
          <DashedAdd label="Add a savings goal" onPress={() => setGoalSheet({ goal: null })} />

          {/* Bills grouped by category */}
          {grouped.map(({ cat, bills: catBills }) => (
            <View key={cat}>
              <SectionHeader
                title={cat}
                icon={<CategoryGlyph billCategory={cat} emoji={billEmoji(cat)} size={21} />}
              />
              {catBills.map((b) => {
                const isOverdue = !b.paid && (b.due_day ?? 99) < todayDay;
                const row = (
                  <ListRow
                    emoji={<CategoryGlyph billCategory={cat} emoji={billEmoji(cat)} />}
                    title={b.name}
                    subtitle={
                      b.paid
                        ? `Paid${memberName(b.paid_by_member_id) ? ` by ${memberName(b.paid_by_member_id)}` : ''}${b.paid_on ? ` · ${b.paid_on}` : ''}${estimateNote(b)}`
                        : `${cat} · ${isOverdue ? `was due ${ordinal(b.due_day ?? 0)}` : `due the ${ordinal(b.due_day ?? 0)}`}`
                    }
                    subColor={isOverdue ? Palette.terracotta : undefined}
                    onPress={() => setBillDetail(b)}
                    outline={isOverdue}
                    dim={b.paid}
                    strikethrough={b.paid}
                    right={
                      <View style={styles.right}>
                        <ThemedText type="label">
                          {b.paid
                            ? fmt(billMonthlyCost(b))
                            : b.amount != null
                              ? fmt(b.amount)
                              : '—'}
                        </ThemedText>
                        {b.paid ? (
                          <View style={styles.paidBadge}>
                            <Check size={13} color={Palette.card} strokeWidth={3} />
                          </View>
                        ) : (
                          <ChevronRight size={16} color="#B7B8C4" />
                        )}
                      </View>
                    }
                  />
                );
                return b.id === firstOverdueId ? (
                  <View key={b.id} ref={firstOverdueRef} collapsable={false}>
                    {row}
                  </View>
                ) : (
                  <View key={b.id}>{row}</View>
                );
              })}
            </View>
          ))}
        </>
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
        onDelete={askDeleteBill}
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
        onDelete={askDeleteGoal}
      />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </Screen>
  );
}

function DashedAdd({ label, onPress, style }: { label: string; onPress: () => void; style?: object }) {
  return (
    <Pressable onPress={onPress} style={[styles.dashedAdd, style]}>
      <View style={styles.plusBadge}>
        <Plus size={16} color={Palette.card} strokeWidth={3} />
      </View>
      <ThemedText type="label">{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: Spacing.six },
  right: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  paidBadge: {
    width: 22,
    height: 22,
    borderRadius: Radius.pill,
    backgroundColor: Palette.sageDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissRow: { marginTop: Spacing.two },
  addTop: { marginTop: Spacing.three },
  goalTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(61,64,91,0.08)',
    overflow: 'hidden',
    marginTop: Spacing.three,
  },
  goalFill: { height: '100%', borderRadius: 999, backgroundColor: Palette.sand },
  dashedAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(61,64,91,0.25)',
    borderRadius: 20,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    marginTop: Spacing.two,
  },
  plusBadge: {
    width: 26,
    height: 26,
    borderRadius: 999,
    backgroundColor: Palette.sageDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
