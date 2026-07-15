import { Check, ChevronRight, Plus } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, findNodeHandle, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BillDetailSheet } from '@/components/bill-detail-sheet';
import { BillSheet } from '@/components/bill-sheet';
import { ConfirmDialog, type ConfirmState } from '@/components/confirm-dialog';
import { GoalDetailSheet } from '@/components/goal-detail-sheet';
import { GoalSheet } from '@/components/goal-sheet';
import { HeroCard } from '@/components/hero-card';
import { ListRow } from '@/components/list-row';
import { MiniCard, TwoUp } from '@/components/mini-card';
import { PaySheet } from '@/components/pay-sheet';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SectionHeader } from '@/components/section-header';
import { ThemedText } from '@/components/themed-text';
import { Palette, Spacing } from '@/constants/theme';
import { BILL_CATS, billEmoji } from '@/lib/categories';
import { ordinal } from '@/lib/format';
import { useHousehold } from '@/lib/household';
import { fmt } from '@/lib/money';
import {
  useBillMutations,
  useBills,
  useGoalMutations,
  useGoals,
  useMembers,
  type BillInput,
  type GoalInput,
} from '@/lib/queries';
import { useSession } from '@/lib/auth';
import type { Bill, Goal } from '@/lib/types';

const MONTH_LABEL = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const TODAY_DAY = new Date().getDate();

export default function BillsScreen() {
  const { householdId } = useHousehold();
  const { session } = useSession();
  const bills = useBills(householdId);
  const goals = useGoals(householdId);
  const members = useMembers(householdId);
  const billMut = useBillMutations(householdId);
  const goalMut = useGoalMutations(householdId);

  const [billSheet, setBillSheet] = useState<{ bill: Bill | null } | null>(null);
  const [goalSheet, setGoalSheet] = useState<{ goal: Goal | null } | null>(null);
  const [billDetail, setBillDetail] = useState<Bill | null>(null);
  const [goalDetail, setGoalDetail] = useState<Goal | null>(null);
  const [paySheet, setPaySheet] = useState<Bill | null>(null);
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
  const overdue = billList.filter((b) => !b.paid && (b.due_day ?? 99) < TODAY_DAY);
  const firstOverdueId = overdue[0]?.id ?? null;
  const dueSoon = billList.filter(
    (b) => !b.paid && (b.due_day ?? 99) >= TODAY_DAY && (b.due_day ?? 99) <= TODAY_DAY + 7
  );
  const frac = billList.length ? paid.length / billList.length : 0;

  const grouped = useMemo(() => {
    const byCat: Record<string, Bill[]> = {};
    billList.forEach((b) => {
      (byCat[b.category] = byCat[b.category] || []).push(b);
    });
    Object.values(byCat).forEach((arr) => arr.sort((a, b) => (a.due_day ?? 0) - (b.due_day ?? 0)));
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
  function confirmPay(amount: number) {
    if (!paySheet) return;
    billMut.markPaid.mutate({ id: paySheet.id, paidAmount: amount, paidByMemberId: currentMemberId });
    setPaySheet(null);
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
      <ScreenHeader eyebrow={MONTH_LABEL} title="Bills" />

      {loading ? (
        <ActivityIndicator color={Palette.sageDeep} style={styles.loading} />
      ) : (
        <>
          <HeroCard
            eyebrow="Bills paid this month"
            big={`${paid.length} of ${billList.length}`}
            sub="paid"
            ringValue={frac}
            ringLabel="done"
          />

          {(overdue.length > 0 || dueSoon.length > 0) && (
            <TwoUp>
              <MiniCard
                label="Overdue"
                warn={overdue.length > 0}
                onPress={overdue.length ? scrollToOverdue : undefined}>
                <ThemedText type="title" style={{ color: overdue.length ? Palette.terracotta : Palette.ink }}>
                  {overdue.length}
                </ThemedText>
              </MiniCard>
              <MiniCard label="Due this week">
                <ThemedText type="title">{dueSoon.length}</ThemedText>
              </MiniCard>
            </TwoUp>
          )}

          <DashedAdd label="Add a bill" onPress={() => setBillSheet({ bill: null })} style={styles.addTop} />

          {/* Savings goals */}
          <SectionHeader title="✨ Savings goals" />
          {(goals.data ?? []).map((g) => {
            const pct = Math.min(1, g.saved_amount / g.target_amount);
            const done = g.saved_amount >= g.target_amount;
            const settled = done || g.paid_this_month;
            return (
              <ListRow
                key={g.id}
                emoji={g.emoji ?? '🎯'}
                tileColor={settled ? '#E7E3D3' : 'rgba(242,204,143,0.3)'}
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
              <SectionHeader title={`${billEmoji(cat)} ${cat}`} />
              {catBills.map((b) => {
                const isOverdue = !b.paid && (b.due_day ?? 99) < TODAY_DAY;
                const row = (
                  <ListRow
                    emoji={billEmoji(cat)}
                    tileColor={b.paid ? '#E7E3D3' : isOverdue ? 'rgba(224,122,95,0.14)' : 'rgba(129,178,154,0.14)'}
                    title={b.name}
                    subtitle={
                      b.paid
                        ? `Paid${memberName(b.paid_by_member_id) ? ` by ${memberName(b.paid_by_member_id)}` : ''}${b.paid_on ? ` · ${b.paid_on}` : ''}`
                        : `${cat} · ${isOverdue ? `was due ${ordinal(b.due_day ?? 0)}` : `due the ${ordinal(b.due_day ?? 0)}`}`
                    }
                    subColor={isOverdue ? Palette.terracotta : undefined}
                    onPress={() => setBillDetail(b)}
                    outline={isOverdue}
                    dim={b.paid}
                    right={
                      <View style={styles.right}>
                        <ThemedText type="label">{b.amount != null ? fmt(b.amount) : '—'}</ThemedText>
                        {b.paid ? <Check size={18} color={Palette.ink} /> : <ChevronRight size={16} color="#B7B8C4" />}
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
        onPay={(b) => {
          setBillDetail(null);
          setPaySheet(b);
        }}
        onEdit={(b) => {
          setBillDetail(null);
          setBillSheet({ bill: b });
        }}
        onDelete={askDeleteBill}
      />
      <PaySheet
        bill={paySheet}
        onClose={() => setPaySheet(null)}
        onConfirm={confirmPay}
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
