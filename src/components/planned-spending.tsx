import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { CategoryGlyph } from '@/components/category-glyph';
import { EnvelopeSheet } from '@/components/envelope-sheet';
import { ListGroup } from '@/components/list-group';
import { ListRow } from '@/components/list-row';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { TX_CATEGORIES, txCategoryById } from '@/lib/categories';
import { fmt } from '@/lib/money';
import { useEnvelopes, useEnvelopeMutations, type EnvelopeDraft } from '@/lib/queries';
import type { WeeklyEnvelope } from '@/lib/types';

/**
 * The planned spending list used by the setup guide: each category with its
 * weekly amount, and an add button. The guide shows the running total and
 * what it leaves free; draining and progress live on the Week screen.
 */
export function PlannedSpending({ householdId }: { householdId: string | null }) {
  const envelopes = useEnvelopes(householdId);
  const mut = useEnvelopeMutations(householdId);
  const [sheet, setSheet] = useState<{ envelope: WeeklyEnvelope | null } | null>(null);

  const list = envelopes.data ?? [];
  const used = list.map((e) => e.category);
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
      {list.length > 0 && (
        <ListGroup>
          {list.map((e) => {
            const cat = txCategoryById(e.category);
            return (
              <ListRow
                key={e.id}
                emoji={<CategoryGlyph txId={cat.id} emoji={cat.emoji} />}
                title={cat.name}
                subtitle="Every week"
                onPress={() => setSheet({ envelope: e })}
                right={<ThemedText type="bodyBold">{fmt(e.weekly_amount)}</ThemedText>}
              />
            );
          })}
        </ListGroup>
      )}

      {canAddMore && (
        <Button
          variant="secondary"
          title={list.length ? 'Add more planned spending' : 'Add planned spending'}
          onPress={() => setSheet({ envelope: null })}
          style={styles.add}
        />
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
  add: { borderWidth: 1, borderColor: 'rgba(61,64,91,0.18)', marginBottom: Spacing.three },
});
