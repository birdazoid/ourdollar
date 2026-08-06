import { ChevronRight, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CategoryGlyph } from '@/components/category-glyph';
import { EnvelopeSheet } from '@/components/envelope-sheet';
import { ListRow } from '@/components/list-row';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { TX_CATEGORIES, txCategoryById } from '@/lib/categories';
import { fmt } from '@/lib/money';
import { useEnvelopes, useEnvelopeMutations, type EnvelopeDraft } from '@/lib/queries';
import type { WeeklyEnvelope } from '@/lib/types';

/**
 * Envelope ("planned spending") config list — reused by Setup and Onboarding.
 * Lists each planned category with its weekly amount, plus an add button and a
 * running weekly total. Draining/progress lives on the Week screen, not here.
 */
export function PlannedSpending({ householdId }: { householdId: string | null }) {
  const envelopes = useEnvelopes(householdId);
  const mut = useEnvelopeMutations(householdId);
  const [sheet, setSheet] = useState<{ envelope: WeeklyEnvelope | null } | null>(null);

  const list = envelopes.data ?? [];
  const used = list.map((e) => e.category);
  const weeklyTotal = list.reduce((a, e) => a + e.weekly_amount, 0);
  const canAddMore = used.length < TX_CATEGORIES.length;

  function save(draft: EnvelopeDraft, id?: string) {
    if (id) mut.update.mutate({ id, weekly_amount: draft.weekly_amount });
    else mut.add.mutate(draft);
    setSheet(null);
  }
  function remove(id: string) {
    mut.remove.mutate(id);
    setSheet(null);
  }

  return (
    <>
      {list.map((e) => {
        const cat = txCategoryById(e.category);
        return (
          <ListRow
            key={e.id}
            emoji={<CategoryGlyph txId={cat.id} emoji={cat.emoji} />}
            title={cat.name}
            subtitle="Every week"
            onPress={() => setSheet({ envelope: e })}
            right={
              <View style={styles.rightRow}>
                <ThemedText type="bodyBold">{fmt(e.weekly_amount)}</ThemedText>
                <ChevronRight size={16} color="#B7B8C4" />
              </View>
            }
          />
        );
      })}

      {canAddMore && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a planned category"
          onPress={() => setSheet({ envelope: null })}
          style={styles.dashedAdd}>
          <View style={styles.plusBadge}>
            <Plus size={16} color={Palette.card} strokeWidth={3} />
          </View>
          <ThemedText type="label">Add a planned category</ThemedText>
        </Pressable>
      )}

      {list.length > 0 && (
        <View style={styles.totalCard}>
          <ThemedText type="bodyBold" style={styles.totalText}>
            Reserved each week
          </ThemedText>
          <ThemedText type="subtitle" style={styles.totalText}>
            {fmt(weeklyTotal)}
          </ThemedText>
        </View>
      )}

      <EnvelopeSheet
        visible={!!sheet}
        envelope={sheet?.envelope ?? null}
        usedCategories={used}
        onClose={() => setSheet(null)}
        onSave={save}
        onDelete={remove}
        saving={mut.add.isPending || mut.update.isPending}
      />
    </>
  );
}

const styles = StyleSheet.create({
  rightRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
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
  totalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Radius.large,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    marginTop: Spacing.two,
    backgroundColor: 'rgba(129,178,154,0.16)',
  },
  totalText: { color: Palette.sageDeep },
});
