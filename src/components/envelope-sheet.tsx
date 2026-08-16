import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { CategoryGlyph } from '@/components/category-glyph';
import { FieldLabel, MoneyInput } from '@/components/inputs';
import { Sheet } from '@/components/sheet';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { TX_CATEGORIES, txCategoryById } from '@/lib/categories';
import type { EnvelopeDraft } from '@/lib/queries';
import type { WeeklyEnvelope } from '@/lib/types';

type Props = {
  visible: boolean;
  envelope: WeeklyEnvelope | null; // null = adding
  usedCategories: string[]; // categories already enveloped (hidden when adding)
  onClose: () => void;
  onSave: (draft: EnvelopeDraft, id?: string) => void;
  onDelete: (id: string) => void;
  saving?: boolean;
};

export function EnvelopeSheet({
  visible,
  envelope,
  usedCategories,
  onClose,
  onSave,
  onDelete,
  saving,
}: Props) {
  const isEdit = !!envelope;
  const [category, setCategory] = useState<string | null>(null);
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (visible) {
      setCategory(envelope?.category ?? null);
      setAmount(envelope ? String(envelope.weekly_amount) : '');
    }
  }, [visible, envelope]);

  const available = TX_CATEGORIES.filter((c) => !usedCategories.includes(c.id));
  const amountNum = Number(amount);
  const valid = !!category && amount !== '' && amountNum > 0;

  return (
    <Sheet
      visible={visible}
      title={isEdit ? 'Edit planned category' : 'Add a planned category'}
      onClose={onClose}>
      {!isEdit && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.intro}>
          Pick a category you spend on every week and set what you plan to spend. It&apos;ll be
          reserved from your weekly money and fill up as the household logs it.
        </ThemedText>
      )}

      {isEdit ? (
        <View style={styles.fixedCat}>
          <View style={styles.fixedTile}>
            <CategoryGlyph
              txId={envelope!.category}
              emoji={txCategoryById(envelope!.category).emoji}
            />
          </View>
          <ThemedText type="bodyBold">{txCategoryById(envelope!.category).name}</ThemedText>
        </View>
      ) : (
        <>
          <FieldLabel>Category</FieldLabel>
          <View style={styles.grid}>
            {available.map((c) => {
              const on = category === c.id;
              return (
                <Pressable
                  key={c.id}
                  accessibilityRole="button"
                  accessibilityLabel={c.name}
                  onPress={() => setCategory(c.id)}
                  style={[styles.catTile, on && styles.catTileOn]}>
                  <CategoryGlyph txId={c.id} emoji={c.emoji} />
                  <ThemedText
                    type="small"
                    themeColor={on ? 'text' : 'textSecondary'}
                    style={styles.catLabel}>
                    {c.name}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      <FieldLabel>Weekly amount</FieldLabel>
      <MoneyInput value={amount} onChangeText={setAmount} size={30} />

      <Button
        title={isEdit ? 'Save' : 'Add planned category'}
        disabled={!valid}
        loading={saving}
        onPress={() => category && onSave({ category, weekly_amount: amountNum }, envelope?.id)}
        style={styles.save}
      />

      {isEdit && (
        <Pressable
          accessibilityRole="button"
          onPress={() => onDelete(envelope!.id)}
          style={styles.remove}>
          <ThemedText type="bodyBold" style={{ color: Palette.terracottaDeep }}>
            Remove this category
          </ThemedText>
        </Pressable>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  intro: { marginBottom: Spacing.three },
  fixedCat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginBottom: Spacing.one,
  },
  fixedTile: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
  save: { marginTop: Spacing.four },
  remove: { alignItems: 'center', paddingVertical: Spacing.three, marginTop: Spacing.one },
});
