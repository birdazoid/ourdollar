import { Pencil, Trash2 } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { GoalGlyph } from '@/components/goal-glyph';
import { Sheet } from '@/components/sheet';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { fmt } from '@/lib/money';
import type { Goal } from '@/lib/types';

type Props = {
  goal: Goal | null;
  onClose: () => void;
  onContribute: (goal: Goal) => void;
  onEdit: (goal: Goal) => void;
  onDelete: (id: string) => void;
};

export function GoalDetailSheet({ goal, onClose, onContribute, onEdit, onDelete }: Props) {
  const done = goal ? goal.saved_amount >= goal.target_amount : false;
  const pct = goal ? Math.min(1, goal.saved_amount / goal.target_amount) : 0;
  // Null when nothing is being put aside monthly, since "never" is not a
  // useful thing to print next to a goal.
  const monthsToGo =
    goal && !done && goal.monthly_amount > 0
      ? Math.ceil((goal.target_amount - goal.saved_amount) / goal.monthly_amount)
      : null;

  return (
    <Sheet
      visible={!!goal}
      title={goal?.name}
      titleIcon={goal ? <GoalGlyph emoji={goal.emoji} size={22} /> : undefined}
      onClose={onClose}>
      {goal && (
        <>
          <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
            {fmt(goal.saved_amount)} saved of {fmt(goal.target_amount)} · {fmt(goal.monthly_amount)}/mo
            {done ? ' · funded! 🎉' : goal.paid_this_month ? " · this month's contribution made" : ''}
          </ThemedText>

          <Card style={styles.infoCard}>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${pct * 100}%` }]} />
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.infoText}>
              {Math.round(pct * 100)}% of the way there
              {done
                ? ''
                : `, ${fmt(goal.target_amount - goal.saved_amount)} to go`}
              {/* The percentage says where you are but not when you arrive,
                  which is the thing anyone looking at a savings goal wants. */}
              {!done && monthsToGo != null
                ? ` · about ${monthsToGo} more month${monthsToGo === 1 ? '' : 's'} at ${fmt(goal.monthly_amount)}/mo`
                : ''}
            </ThemedText>
          </Card>

          <View style={styles.actions}>
            {!done && !goal.paid_this_month && (
              <View style={styles.flex}>
                <Button title="Mark paid" onPress={() => onContribute(goal)} />
              </View>
            )}
            <Pressable style={[styles.flex, styles.editBtn]} onPress={() => onEdit(goal)}>
              <Pencil size={16} color={Palette.ink} />
              <ThemedText type="bodyBold">Edit</ThemedText>
            </Pressable>
            <Pressable
              accessibilityLabel="Delete goal"
              style={styles.deleteBtn}
              onPress={() => onDelete(goal.id)}>
              <Trash2 size={18} color={Palette.terracottaDeep} />
            </Pressable>
          </View>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sub: { marginTop: -Spacing.two, marginBottom: Spacing.three },
  infoCard: { marginBottom: Spacing.three, gap: Spacing.two },
  track: { height: 8, borderRadius: Radius.pill, backgroundColor: 'rgba(61,64,91,0.08)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: Radius.pill, backgroundColor: Palette.sand },
  infoText: {},
  actions: { flexDirection: 'row', gap: Spacing.two, alignItems: 'stretch' },
  flex: { flex: 1 },
  editBtn: {
    flexDirection: 'row',
    gap: Spacing.two,
    height: 52,
    borderRadius: Radius.large,
    backgroundColor: Palette.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    width: 52,
    height: 52,
    borderRadius: Radius.large,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(224,122,95,0.14)',
  },
});
