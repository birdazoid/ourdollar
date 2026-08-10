import { Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { GoalGlyph } from '@/components/goal-glyph';
import { FieldLabel, TextField } from '@/components/inputs';
import { Sheet } from '@/components/sheet';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { GOAL_EMOJI_OPTIONS } from '@/lib/categories';
import { groupAmountInput, sanitizeAmountInput } from '@/lib/money';
import type { GoalInput } from '@/lib/queries';
import type { Goal } from '@/lib/types';

type Props = {
  visible: boolean;
  goal: Goal | null; // null = add
  onClose: () => void;
  onSave: (input: GoalInput, id?: string) => void;
  onDelete: (id: string) => void;
  saving?: boolean;
};

export function GoalSheet({ visible, goal, onClose, onSave, onDelete, saving }: Props) {
  const isEdit = !!goal;
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [monthly, setMonthly] = useState('');
  const [emoji, setEmoji] = useState<string>('🎯');

  useEffect(() => {
    if (!visible) return;
    setName(goal?.name ?? '');
    setTarget(goal?.target_amount != null ? String(goal.target_amount) : '');
    setMonthly(goal?.monthly_amount != null ? String(goal.monthly_amount) : '');
    setEmoji(goal?.emoji ?? '🎯');
  }, [visible, goal]);

  const valid =
    name.trim() !== '' && target !== '' && Number(target) > 0 && monthly !== '' && Number(monthly) >= 0;

  return (
    <Sheet visible={visible} title={isEdit ? 'Edit goal' : 'Add a savings goal'} onClose={onClose}>
      <TextField placeholder="Goal name" value={name} onChangeText={setName} style={styles.mb} />

      <View style={styles.row}>
        <View style={styles.flex}>
          <FieldLabel>Target</FieldLabel>
          <Card style={styles.inlineField}>
            <ThemedText type="body" themeColor="textSecondary">
              $
            </ThemedText>
            <TextField
              placeholder="amount"
              value={groupAmountInput(target)}
              onChangeText={(t) => setTarget(sanitizeAmountInput(t))}
              keyboardType="decimal-pad"
              inputMode="decimal"
              style={styles.inlineInput}
            />
          </Card>
        </View>
        <View style={styles.flex}>
          <FieldLabel>Per month</FieldLabel>
          <Card style={styles.inlineField}>
            <ThemedText type="body" themeColor="textSecondary">
              $
            </ThemedText>
            <TextField
              placeholder="amount"
              value={groupAmountInput(monthly)}
              onChangeText={(t) => setMonthly(sanitizeAmountInput(t))}
              keyboardType="decimal-pad"
              inputMode="decimal"
              style={styles.inlineInput}
            />
          </Card>
        </View>
      </View>

      <FieldLabel>Icon</FieldLabel>
      <View style={styles.emojiRow}>
        {GOAL_EMOJI_OPTIONS.map((e) => {
          const on = emoji === e;
          return (
            <Pressable key={e} onPress={() => setEmoji(e)} style={[styles.emojiTile, on && styles.emojiOn]}>
              <GoalGlyph emoji={e} />
            </Pressable>
          );
        })}
      </View>

      <View style={styles.actions}>
        {isEdit && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete goal"
            onPress={() => onDelete(goal.id)}
            style={styles.deleteBtn}>
            <Trash2 size={20} color={Palette.terracottaDeep} />
          </Pressable>
        )}
        <View style={styles.flex}>
          <Button
            title={isEdit ? 'Save changes' : 'Add goal'}
            loading={saving}
            disabled={!valid}
            onPress={() =>
              onSave(
                {
                  name: name.trim(),
                  target_amount: Number(target),
                  monthly_amount: Number(monthly),
                  emoji,
                },
                goal?.id
              )
            }
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  mb: { marginBottom: Spacing.two },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.two },
  inlineField: { flexDirection: 'row', alignItems: 'center', paddingVertical: 0, paddingHorizontal: Spacing.three },
  inlineInput: { flex: 1, backgroundColor: 'transparent', height: 52 },
  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginBottom: Spacing.four },
  emojiTile: {
    width: 44,
    height: 44,
    borderRadius: Radius.medium,
    backgroundColor: Palette.card,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiOn: { borderColor: Palette.sage },
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
