import { useLocalSearchParams, useRouter } from 'expo-router';
import { Trash2, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ConfirmDialog, type ConfirmState } from '@/components/confirm-dialog';
import { FieldLabel, MoneyInput, TextField } from '@/components/inputs';
import { Segmented } from '@/components/segmented';
import { Switch } from '@/components/switch';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { TX_CATEGORIES, txCategoryById } from '@/lib/categories';
import { useHousehold } from '@/lib/household';
import { fmt } from '@/lib/money';
import {
  useMembers,
  useTransactionMutations,
  useTransactions,
  type TransactionInput,
} from '@/lib/queries';
import { dayShort, getWeek, todayISO } from '@/lib/week';

type TxType = 'expense' | 'income';

export default function AddExpenseScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { householdId } = useHousehold();
  const { session } = useSession();
  const members = useMembers(householdId);
  const transactions = useTransactions(householdId);
  const txMut = useTransactionMutations(householdId);

  const editing = (transactions.data ?? []).find((t) => t.id === id) ?? null;
  const isEdit = !!editing;

  const currentMemberId =
    (members.data ?? []).find((m) => m.account_id === session?.user.id)?.id ??
    members.data?.[0]?.id ??
    null;

  const weekDays = useMemo(() => getWeek(0).days, []);

  const [amount, setAmount] = useState(editing ? String(editing.amount) : '');
  const [label, setLabel] = useState(editing?.label ?? '');
  const [category, setCategory] = useState<string | null>(editing?.category ?? null);
  const [memberId, setMemberId] = useState<string | null>(editing?.member_id ?? currentMemberId);
  const [type, setType] = useState<TxType>(editing?.type ?? 'expense');
  const [isFun, setIsFun] = useState(editing?.is_fun_money ?? false);
  const [day, setDay] = useState(editing?.occurred_on ?? todayISO());
  const [showSug, setShowSug] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  // members load async, so currentMemberId is null on first render — adopt it as
  // the default "who" once it resolves (unless the user already picked someone).
  useEffect(() => {
    if (memberId == null && currentMemberId) setMemberId(currentMemberId);
  }, [currentMemberId, memberId]);

  // Merchant autosuggest from past transaction labels.
  const suggestions = useMemo(() => {
    const q = label.trim().toLowerCase();
    if (!q) return [];
    const seen = new Map<string, { label: string; category: string | null; amount: number }>();
    for (const t of transactions.data ?? []) {
      const key = (t.label ?? '').toLowerCase();
      if (!t.label || !key.startsWith(q) || key === q || seen.has(key)) continue;
      seen.set(key, { label: t.label, category: t.category, amount: t.amount });
    }
    return [...seen.values()].slice(0, 4);
  }, [label, transactions.data]);

  const amountNum = Number(amount);
  const valid = amount !== '' && amountNum > 0 && label.trim() !== '' && !!category;

  function save() {
    const input: TransactionInput = {
      member_id: memberId,
      amount: amountNum,
      category,
      label: label.trim(),
      type,
      is_fun_money: type === 'expense' ? isFun : false,
      occurred_on: day,
    };
    if (isEdit) txMut.update.mutate({ id: editing!.id, ...input });
    else txMut.create.mutate(input);
    router.back();
  }

  function askDelete() {
    if (!editing) return;
    setConfirm({
      title: 'Delete this entry?',
      message: `This removes "${editing.label}" (${fmt(editing.amount)}) from your log.`,
      onConfirm: () => {
        txMut.remove.mutate(editing.id);
        router.back();
      },
    });
  }

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <View style={styles.header}>
          <ThemedText type="title">{isEdit ? 'Edit expense' : 'Add expense'}</ThemedText>
          <Pressable accessibilityLabel="Close" onPress={() => router.back()} style={styles.close}>
            <X size={22} color={Palette.ink} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Segmented
            value={type}
            onChange={(v) => setType(v as TxType)}
            options={[
              { value: 'expense', label: 'Expense' },
              { value: 'income', label: '↩ Money back' },
            ]}
          />

          <View style={styles.gap} />
          <MoneyInput value={amount} onChangeText={setAmount} size={34} autoFocus={!isEdit} />

          <View style={styles.labelWrap}>
            <TextField
              placeholder={type === 'income' ? "What's it from? (refund…)" : 'Where? (Walmart, QuikTrip…)'}
              value={label}
              onChangeText={(t) => {
                setLabel(t);
                setShowSug(true);
              }}
              onFocus={() => setShowSug(true)}
            />
            {showSug && suggestions.length > 0 && (
              <Card style={styles.sugBox}>
                {suggestions.map((m) => (
                  <Pressable
                    key={m.label}
                    style={styles.sugRow}
                    onPress={() => {
                      setLabel(m.label);
                      if (!category) setCategory(m.category);
                      if (!amount) setAmount(String(m.amount));
                      setShowSug(false);
                    }}>
                    <ThemedText type="body">
                      {txCategoryById(m.category).emoji} {m.label}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {fmt(m.amount)}
                    </ThemedText>
                  </Pressable>
                ))}
              </Card>
            )}
          </View>

          <FieldLabel>Category</FieldLabel>
          <View style={styles.grid}>
            {TX_CATEGORIES.map((c) => {
              const on = category === c.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setCategory(c.id)}
                  style={[styles.catTile, on && styles.catTileOn]}>
                  <ThemedText type="subtitle">{c.emoji}</ThemedText>
                  <ThemedText type="small" themeColor={on ? 'text' : 'textSecondary'} style={styles.catLabel}>
                    {c.name}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {(members.data ?? []).length > 0 && (
            <>
              <FieldLabel>Who?</FieldLabel>
              <Segmented
                value={memberId ?? members.data![0].id}
                onChange={setMemberId}
                options={(members.data ?? []).map((m) => ({
                  value: m.id,
                  label: m.account_id === session?.user.id ? `${m.name} (me)` : m.name,
                }))}
              />
            </>
          )}

          <FieldLabel>Which day?</FieldLabel>
          <View style={styles.dayRow}>
            {weekDays.map((d) => {
              const on = day === d.date;
              return (
                <Pressable
                  key={d.date}
                  onPress={() => setDay(d.date)}
                  style={[styles.dayBtn, on && styles.dayBtnOn]}>
                  <ThemedText type="small" themeColor={on ? undefined : 'textSecondary'} style={on ? styles.dayOnText : undefined}>
                    {d.short}
                  </ThemedText>
                  <ThemedText type="label" style={on ? styles.dayOnText : undefined}>
                    {d.dayNum}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {type === 'expense' && (
            <Pressable onPress={() => setIsFun(!isFun)} style={[styles.funRow, isFun && styles.funOn]}>
              <ThemedText type="subtitle">✨</ThemedText>
              <View style={styles.flex}>
                <ThemedText type="bodyBold">Fun money</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {isFun ? 'From a personal stash' : 'Counts against the weekly budget'}
                </ThemedText>
              </View>
              <Switch value={isFun} onValueChange={setIsFun} onColor={Palette.sand} />
            </Pressable>
          )}

          <View style={styles.actions}>
            {isEdit && (
              <Pressable accessibilityLabel="Delete entry" onPress={askDelete} style={styles.deleteBtn}>
                <Trash2 size={20} color={Palette.terracottaDeep} />
              </Pressable>
            )}
            <View style={styles.flex}>
              <Button
                title={
                  isEdit
                    ? 'Save changes'
                    : `${type === 'income' ? 'Add money back' : 'Add expense'}${valid ? ' · ' + fmt(amountNum) : ''}`
                }
                disabled={!valid}
                onPress={save}
              />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    backgroundColor: Palette.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six },
  gap: { height: Spacing.three },
  flex: { flex: 1 },
  labelWrap: { marginTop: Spacing.three, position: 'relative', zIndex: 10 },
  sugBox: { position: 'absolute', top: 56, left: 0, right: 0, padding: 0, zIndex: 20 },
  sugRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(61,64,91,0.1)',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  catTile: {
    width: '31.5%',
    alignItems: 'center',
    gap: Spacing.one,
    backgroundColor: Palette.card,
    borderRadius: Radius.medium,
    borderWidth: 2,
    borderColor: 'transparent',
    paddingVertical: Spacing.two + 2,
  },
  catTileOn: { borderColor: Palette.sage },
  catLabel: { textAlign: 'center' },
  dayRow: { flexDirection: 'row', gap: Spacing.one },
  dayBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    backgroundColor: Palette.card,
    borderRadius: Radius.medium,
    paddingVertical: Spacing.two,
  },
  dayBtnOn: { backgroundColor: Palette.ink },
  dayOnText: { color: Palette.card },
  funRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.card,
    borderRadius: Radius.large,
    padding: Spacing.three,
    marginTop: Spacing.four,
  },
  funOn: { backgroundColor: 'rgba(242,204,143,0.25)' },
  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.four },
  deleteBtn: {
    width: 52,
    height: 52,
    borderRadius: Radius.large,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(224,122,95,0.14)',
  },
});
