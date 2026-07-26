import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { GoalGlyph } from '@/components/goal-glyph';
import { Sheet } from '@/components/sheet';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { fmt } from '@/lib/money';
import type { RolloverResolution } from '@/lib/queries';
import type { Goal } from '@/lib/types';

type Props = {
  visible: boolean;
  amount: number; // signed: + leftover, − overage
  goals: Goal[];
  loading?: boolean;
  onResolve: (resolution: RolloverResolution, goalId?: string) => void;
};

/**
 * Appears once when a new week starts and the just-ended week finished with
 * money left over or over budget. Asks what to do with it rather than silently
 * folding it into the new week (design-brief: household stays in control).
 */
export function RolloverPrompt({ visible, amount, goals, loading, onResolve }: Props) {
  const [pickingGoal, setPickingGoal] = useState(false);
  const over = amount < 0;
  const abs = Math.abs(amount);

  function close(resolution: RolloverResolution, goalId?: string) {
    setPickingGoal(false);
    onResolve(resolution, goalId);
  }

  if (pickingGoal) {
    return (
      <Sheet visible={visible} title="Which goal?" onClose={() => setPickingGoal(false)}>
        {goals.map((g) => (
          <Pressable key={g.id} onPress={() => close('goal', g.id)} style={styles.goalRow}>
            <GoalGlyph emoji={g.emoji} />
            <View style={styles.flex}>
              <ThemedText type="bodyBold">{g.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {fmt(g.saved_amount)} of {fmt(g.target_amount)}
              </ThemedText>
            </View>
          </Pressable>
        ))}
      </Sheet>
    );
  }

  return (
    <Sheet visible={visible} title="Last week wrapped up" onClose={() => close('dismiss')}>
      <View style={styles.headline}>
        <ThemedText type="display" style={over ? styles.overColor : styles.underColor}>
          {over ? '-' : '+'}
          {fmt(abs)}
        </ThemedText>
        <ThemedText type="body" themeColor="textSecondary" style={styles.center}>
          {over ? "You went over last week's budget." : "You had money left over last week."}
        </ThemedText>
      </View>

      <Option
        label={over ? "Take it from this week's money" : "Add it to this week's money"}
        sub={over ? 'This week starts a bit tighter.' : 'This week starts with extra room.'}
        onPress={() => close('carry_forward')}
        loading={loading}
      />
      {goals.length > 0 && (
        <Option
          label={over ? 'Take it from a savings goal' : 'Put it toward a savings goal'}
          sub={over ? "Cover it from what you've saved." : 'Give a goal a boost.'}
          onPress={() => setPickingGoal(true)}
          loading={loading}
        />
      )}
      <Option
        label={over ? 'Just move on' : 'Just start fresh'}
        sub="This week resets clean, no adjustment."
        onPress={() => close('dismiss')}
        loading={loading}
      />
    </Sheet>
  );
}

function Option({
  label,
  sub,
  onPress,
  loading,
}: {
  label: string;
  sub: string;
  onPress: () => void;
  loading?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={loading} style={styles.option}>
      <ThemedText type="bodyBold">{label}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {sub}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center', marginTop: Spacing.one },
  headline: { alignItems: 'center', marginBottom: Spacing.four },
  overColor: { color: Palette.terracottaDeep },
  underColor: { color: Palette.sageDeep },
  option: {
    backgroundColor: Palette.card,
    borderRadius: Radius.large,
    padding: Spacing.three,
    marginBottom: Spacing.two,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.card,
    borderRadius: Radius.large,
    padding: Spacing.three,
    marginBottom: Spacing.two,
  },
});
