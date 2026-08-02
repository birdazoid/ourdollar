import { Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Segmented } from '@/components/segmented';
import { Sheet } from '@/components/sheet';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Palette, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { FREQ, fmt, monthlyEquiv } from '@/lib/money';
import type { ExtraIncome, Frequency, HouseholdMember, IncomeSource } from '@/lib/types';
import { todayISO } from '@/lib/week';

/**
 * "How often" includes one-off, because that IS the answer to how often a bonus
 * arrives. Keeping it in the same picker means one "Add income" button rather
 * than making people decide which of two buttons they need before they've been
 * told the difference.
 */
type Cadence = Frequency | 'one-off';

/** What the sheet is editing, or null when adding. */
export type IncomeTarget =
  | { kind: 'recurring'; source: IncomeSource }
  | { kind: 'one-off'; entry: ExtraIncome }
  | null;

export type IncomeDraft =
  | { kind: 'recurring'; member_id: string | null; amount: number; frequency: Frequency }
  | { kind: 'one-off'; member_id: string | null; amount: number; source: string; occurred_on: string };

type Props = {
  visible: boolean;
  target: IncomeTarget;
  members: HouseholdMember[];
  onClose: () => void;
  onSave: (draft: IncomeDraft, id?: string) => void;
  onDelete: (id: string, kind: 'recurring' | 'one-off') => void;
  saving?: boolean;
};

export function IncomeSheet({ visible, target, members, onClose, onSave, onDelete, saving }: Props) {
  const theme = useTheme();
  const isEdit = !!target;
  const [amount, setAmount] = useState('');
  const [memberId, setMemberId] = useState<string | null>(null);
  const [cadence, setCadence] = useState<Cadence>('monthly');
  const [label, setLabel] = useState('');

  // Reset fields whenever the sheet opens for a different entry.
  useEffect(() => {
    if (!visible) return;
    if (target?.kind === 'one-off') {
      setAmount(String(target.entry.amount));
      setMemberId(target.entry.member_id ?? members[0]?.id ?? null);
      setCadence('one-off');
      setLabel(target.entry.source);
      return;
    }
    setAmount(target ? String(target.source.amount) : '');
    setMemberId(target?.source.member_id ?? members[0]?.id ?? null);
    setCadence(target?.source.frequency ?? 'monthly');
    setLabel('');
  }, [visible, target, members]);

  const isOneOff = cadence === 'one-off';
  const amountNum = Number(amount);
  const valid = amount !== '' && amountNum > 0 && (!isOneOff || label.trim() !== '');

  function save() {
    if (isOneOff) {
      onSave(
        {
          kind: 'one-off',
          member_id: memberId,
          amount: amountNum,
          source: label.trim(),
          occurred_on: target?.kind === 'one-off' ? target.entry.occurred_on : todayISO(),
        },
        target?.kind === 'one-off' ? target.entry.id : undefined
      );
      return;
    }
    onSave(
      { kind: 'recurring', member_id: memberId, amount: amountNum, frequency: cadence },
      target?.kind === 'recurring' ? target.source.id : undefined
    );
  }

  return (
    <Sheet visible={visible} title={isEdit ? 'Edit income' : 'Add income'} onClose={onClose}>
      <Card style={styles.amountCard}>
        <ThemedText type="display" themeColor="textSecondary">
          $
        </ThemedText>
        <TextInput
          value={amount}
          onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
          inputMode="decimal"
          autoFocus
          placeholder="0.00"
          placeholderTextColor="#B7B8C4"
          style={[styles.amountInput, { color: theme.text }]}
        />
      </Card>

      {members.length > 0 && (
        <>
          <ThemedText type="label" themeColor="textSecondary" style={styles.fieldLabel}>
            {isOneOff ? 'Who received it?' : 'Whose income?'}
          </ThemedText>
          <Segmented
            wrap
            value={memberId ?? members[0].id}
            onChange={setMemberId}
            options={members.map((m) => ({ value: m.id, label: m.name }))}
          />
        </>
      )}

      <ThemedText type="label" themeColor="textSecondary" style={styles.fieldLabel}>
        How often?
      </ThemedText>
      <Segmented
        wrap
        value={cadence}
        onChange={setCadence}
        options={[
          { value: 'monthly', label: FREQ.monthly.label },
          { value: 'semimonthly', label: FREQ.semimonthly.label },
          { value: 'biweekly', label: FREQ.biweekly.label },
          { value: 'weekly', label: FREQ.weekly.label },
          { value: 'one-off', label: 'One-off' },
        ]}
      />

      {/* One-off needs a name, since "a $250 thing in July" isn't memorable
          the way "Jamie, monthly" is. */}
      {isOneOff && (
        <>
          <ThemedText type="label" themeColor="textSecondary" style={styles.fieldLabel}>
            What was it?
          </ThemedText>
          <Card style={styles.textCard}>
            <TextInput
              value={label}
              onChangeText={setLabel}
              placeholder="Bonus, tax refund, side job…"
              placeholderTextColor="#B7B8C4"
              style={[styles.textInput, { color: theme.text }]}
            />
          </Card>
        </>
      )}

      {valid &&
        (isOneOff ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.equiv}>
            Counts toward this month only. It won’t repeat next month.
          </ThemedText>
        ) : (
          <ThemedText type="small" themeColor="positiveDeep" style={styles.equiv}>
            ≈ {fmt(Math.round(monthlyEquiv({ amount: amountNum, frequency: cadence })))} / month
          </ThemedText>
        ))}

      <View style={styles.actions}>
        {isEdit && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete income"
            onPress={() =>
              target.kind === 'one-off'
                ? onDelete(target.entry.id, 'one-off')
                : onDelete(target.source.id, 'recurring')
            }
            style={styles.deleteBtn}>
            <Trash2 size={20} color={Palette.terracottaDeep} />
          </Pressable>
        )}
        <View style={styles.saveWrap}>
          <Button
            title={isEdit ? 'Save changes' : 'Add income'}
            loading={saving}
            disabled={!valid}
            onPress={save}
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  amountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.four,
    marginBottom: Spacing.three,
  },
  amountInput: {
    flex: 1,
    fontFamily: Fonts.serif.bold,
    fontSize: 36,
    padding: 0,
  },
  textCard: { paddingVertical: Spacing.three },
  textInput: { fontSize: 16, padding: 0 },
  fieldLabel: {
    marginTop: Spacing.three,
    marginBottom: Spacing.two,
  },
  equiv: {
    marginTop: Spacing.two,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.four,
  },
  saveWrap: { flex: 1 },
  deleteBtn: {
    width: 52,
    height: 52,
    borderRadius: Radius.large,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(224,122,95,0.14)',
  },
});
