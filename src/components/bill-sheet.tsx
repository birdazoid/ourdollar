import { Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import IconGraph from '@/assets/icons/icon-graph.svg';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { CategoryGlyph } from '@/components/category-glyph';
import { FieldLabel, TextField } from '@/components/inputs';
import { Sheet } from '@/components/sheet';
import { Switch } from '@/components/switch';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { BILL_CATS, billEmoji } from '@/lib/categories';
import { ordinal } from '@/lib/format';
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

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

export function BillSheet({ visible, bill, onClose, onSave, onDelete, saving }: Props) {
  const isEdit = !!bill;
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [varies, setVaries] = useState(false);
  const [pickingDay, setPickingDay] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(bill?.name ?? '');
    setAmount(bill?.amount != null ? String(bill.amount) : '');
    setDueDay(bill?.due_day != null ? String(bill.due_day) : '');
    setCategory(bill?.category ?? null);
    setVaries(bill?.varies ?? false);
    setPickingDay(false);
    setShowErrors(false);
  }, [visible, bill]);

  const dayNum = Number(dueDay);
  const nameMissing = name.trim() === '';
  const categoryMissing = !category;
  const dueDayMissing = dueDay === '' || dayNum < 1 || dayNum > 31;
  const valid = !nameMissing && !categoryMissing && !dueDayMissing;

  const missingLabels = [
    nameMissing && 'a bill name',
    categoryMissing && 'a category',
    dueDayMissing && 'a due date',
  ].filter((x): x is string => !!x);

  function attemptSave() {
    if (!valid) {
      setShowErrors(true);
      return;
    }
    onSave(
      {
        name: name.trim(),
        amount: amount === '' ? null : Number(amount),
        category: category!,
        due_day: dayNum,
        varies,
      },
      bill?.id
    );
  }

  return (
    <Sheet visible={visible} title={isEdit ? 'Edit bill' : 'Add bill'} onClose={onClose}>
      <TextField
        placeholder="Bill name"
        value={name}
        onChangeText={(t) => {
          setName(t);
          if (showErrors) setShowErrors(false);
        }}
        style={[styles.mb, showErrors && nameMissing && styles.fieldError]}
      />

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
        <Card style={[styles.inlineField, styles.dueField, showErrors && dueDayMissing && styles.fieldErrorCard]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Due day"
            onPress={() => setPickingDay((v) => !v)}
            style={styles.dueTouchable}>
            <ThemedText type="body" themeColor={dueDay ? 'text' : 'textSecondary'}>
              {dueDay ? `Due the ${ordinal(dayNum)}` : 'Due day'}
            </ThemedText>
          </Pressable>
        </Card>
      </View>

      {pickingDay && (
        <Card style={styles.dayGrid}>
          {DAYS.map((d) => {
            const on = dayNum === d;
            return (
              <Pressable
                key={d}
                accessibilityRole="button"
                accessibilityLabel={`Due the ${ordinal(d)}`}
                accessibilityState={{ selected: on }}
                onPress={() => {
                  setDueDay(String(d));
                  setPickingDay(false);
                  if (showErrors) setShowErrors(false);
                }}
                style={[styles.dayPill, on && styles.dayPillOn]}>
                <ThemedText type="small" style={on ? styles.dayPillOnText : undefined} themeColor={on ? undefined : 'textSecondary'}>
                  {d}
                </ThemedText>
              </Pressable>
            );
          })}
        </Card>
      )}

      <FieldLabel>Category</FieldLabel>
      <View style={[styles.grid, showErrors && categoryMissing && styles.gridError]}>
        {BILL_CATS.map((c) => {
          const on = category === c;
          return (
            <Pressable
              key={c}
              onPress={() => {
                setCategory(c);
                if (showErrors) setShowErrors(false);
              }}
              style={[styles.catTile, on && styles.catTileOn]}>
              <CategoryGlyph billCategory={c} emoji={billEmoji(c)} />
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
        <IconGraph width={23} height={23} color={Palette.ink} />
        <View style={styles.flex}>
          <ThemedText type="bodyBold">Amount varies monthly</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Utilities &amp; credit cards — confirm when paying
          </ThemedText>
        </View>
        <Switch value={varies} onValueChange={setVaries} onColor={Palette.sand} />
      </Pressable>

      {showErrors && missingLabels.length > 0 && (
        <ThemedText type="small" themeColor="warningDeep" style={styles.errText}>
          Enter {joinList(missingLabels)} to continue.
        </ThemedText>
      )}

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
            onPress={attemptSave}
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
  dueField: { flex: 0, width: 150 },
  dueTouchable: { flex: 1, justifyContent: 'center' },
  inlineInput: { flex: 1, backgroundColor: 'transparent', height: 52 },
  fieldError: { borderWidth: 1.5, borderColor: Palette.terracotta },
  fieldErrorCard: { borderWidth: 1.5, borderColor: Palette.terracotta },
  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    marginBottom: Spacing.three,
  },
  dayPill: {
    flexBasis: '12.2%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.medium,
    backgroundColor: Palette.linen,
  },
  dayPillOn: { backgroundColor: Palette.sage },
  dayPillOnText: { color: Palette.card },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginBottom: Spacing.three, borderRadius: Radius.large },
  gridError: { borderWidth: 1.5, borderColor: Palette.terracotta, padding: Spacing.two, margin: -Spacing.two, marginBottom: Spacing.one },
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
  errText: { marginTop: -Spacing.two, marginBottom: Spacing.three },
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
