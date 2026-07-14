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
import type { Frequency, HouseholdMember, IncomeSource } from '@/lib/types';

export type IncomeDraft = {
  member_id: string | null;
  amount: number;
  frequency: Frequency;
};

type Props = {
  visible: boolean;
  source: IncomeSource | null; // null = add mode
  members: HouseholdMember[];
  onClose: () => void;
  onSave: (draft: IncomeDraft, id?: string) => void;
  onDelete: (id: string) => void;
  saving?: boolean;
};

export function IncomeSheet({ visible, source, members, onClose, onSave, onDelete, saving }: Props) {
  const theme = useTheme();
  const isEdit = !!source;
  const [amount, setAmount] = useState('');
  const [memberId, setMemberId] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<Frequency>('monthly');

  // Reset fields whenever the sheet opens for a different source.
  useEffect(() => {
    if (!visible) return;
    setAmount(source ? String(source.amount) : '');
    setMemberId(source?.member_id ?? members[0]?.id ?? null);
    setFrequency(source?.frequency ?? 'monthly');
  }, [visible, source, members]);

  const amountNum = Number(amount);
  const valid = amount !== '' && amountNum > 0;

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
            Whose income?
          </ThemedText>
          <Segmented
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
        value={frequency}
        onChange={setFrequency}
        options={[
          { value: 'monthly', label: FREQ.monthly.label },
          { value: 'semimonthly', label: FREQ.semimonthly.label },
        ]}
      />
      {valid && (
        <ThemedText type="small" themeColor="positiveDeep" style={styles.equiv}>
          ≈ {fmt(Math.round(monthlyEquiv({ amount: amountNum, frequency })))} / month
        </ThemedText>
      )}

      <View style={styles.actions}>
        {isEdit && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete income"
            onPress={() => onDelete(source.id)}
            style={styles.deleteBtn}>
            <Trash2 size={20} color={Palette.terracottaDeep} />
          </Pressable>
        )}
        <View style={styles.saveWrap}>
          <Button
            title={isEdit ? 'Save changes' : 'Add income'}
            loading={saving}
            disabled={!valid}
            onPress={() => onSave({ member_id: memberId, amount: amountNum, frequency }, source?.id)}
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
