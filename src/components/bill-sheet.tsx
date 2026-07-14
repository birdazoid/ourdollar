import { Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { FieldLabel, TextField } from '@/components/inputs';
import { Sheet } from '@/components/sheet';
import { Switch } from '@/components/switch';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { BILL_CATS, billEmoji } from '@/lib/categories';
import type { BillInput } from '@/lib/queries';
import type { Bill } from '@/lib/types';

type Props = {
  visible: boolean;
  bill: Bill | null; // null = add
  onClose: () => void;
  onSave: (input: BillInput, id?: string) => void;
  onDelete: (id: string) => void;
  saving?: boolean;
};

export function BillSheet({ visible, bill, onClose, onSave, onDelete, saving }: Props) {
  const theme = useTheme();
  const isEdit = !!bill;
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [varies, setVaries] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(bill?.name ?? '');
    setAmount(bill?.amount != null ? String(bill.amount) : '');
    setDueDay(bill?.due_day != null ? String(bill.due_day) : '');
    setCategory(bill?.category ?? null);
    setVaries(bill?.varies ?? false);
  }, [visible, bill]);

  const dayNum = Number(dueDay);
  const valid = name.trim() !== '' && !!category && dueDay !== '' && dayNum >= 1 && dayNum <= 31;

  return (
    <Sheet visible={visible} title={isEdit ? 'Edit bill' : 'Add bill'} onClose={onClose}>
      <TextField placeholder="Bill name" value={name} onChangeText={setName} style={styles.mb} />

      <View style={styles.row}>
        <Card style={styles.inlineField}>
          <ThemedText type="body" themeColor="textSecondary">
            $
          </ThemedText>
          <TextField
            placeholder="amount"
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))}
            keyboardType="decimal-pad"
            inputMode="decimal"
            style={styles.inlineInput}
          />
        </Card>
        <Card style={[styles.inlineField, styles.dueField]}>
          <TextField
            placeholder="due day"
            value={dueDay}
            onChangeText={(t) => setDueDay(t.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={2}
            style={styles.inlineInput}
          />
        </Card>
      </View>

      <FieldLabel>Category</FieldLabel>
      <View style={styles.grid}>
        {BILL_CATS.map((c) => {
          const on = category === c;
          return (
            <Pressable
              key={c}
              onPress={() => setCategory(c)}
              style={[styles.catTile, on && styles.catTileOn]}>
              <ThemedText type="subtitle">{billEmoji(c)}</ThemedText>
              <ThemedText
                type="small"
                themeColor={on ? 'text' : 'textSecondary'}
                style={styles.catLabel}>
                {c}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={() => setVaries(!varies)}
        style={[styles.variesRow, varies && styles.variesOn]}>
        <ThemedText type="subtitle">📊</ThemedText>
        <View style={styles.flex}>
          <ThemedText type="bodyBold">Amount varies monthly</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Utilities &amp; credit cards — confirm when paying
          </ThemedText>
        </View>
        <Switch value={varies} onValueChange={setVaries} onColor={Palette.sand} />
      </Pressable>

      <View style={styles.actions}>
        {isEdit && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete bill"
            onPress={() => onDelete(bill.id)}
            style={styles.deleteBtn}>
            <Trash2 size={20} color={Palette.terracottaDeep} />
          </Pressable>
        )}
        <View style={styles.flex}>
          <Button
            title={isEdit ? 'Save changes' : 'Add bill'}
            loading={saving}
            disabled={!valid}
            onPress={() =>
              onSave(
                {
                  name: name.trim(),
                  amount: amount === '' ? null : Number(amount),
                  category: category!,
                  due_day: dayNum,
                  varies,
                },
                bill?.id
              )
            }
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  mb: { marginBottom: Spacing.three },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.two },
  inlineField: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 0, paddingHorizontal: Spacing.three },
  dueField: { flex: 0, width: 118 },
  inlineInput: { flex: 1, backgroundColor: 'transparent', height: 52 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginBottom: Spacing.three },
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
  variesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.card,
    borderRadius: Radius.large,
    padding: Spacing.three,
    marginBottom: Spacing.four,
  },
  variesOn: { backgroundColor: 'rgba(242,204,143,0.25)' },
  actions: { flexDirection: 'row', gap: Spacing.two },
  deleteBtn: {
    width: 52,
    height: 52,
    borderRadius: Radius.large,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(224,122,95,0.14)',
  },
});
