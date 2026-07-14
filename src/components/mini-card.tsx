import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';

/** Row of two equal-width mini stat cards. */
export function TwoUp({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

type MiniCardProps = {
  label: string;
  children: ReactNode;
  warn?: boolean;
  onPress?: () => void;
};

/** Small stat card. `warn` gives it a terracotta outline (design-brief §8). */
export function MiniCard({ label, children, warn, onPress }: MiniCardProps) {
  const inner = (
    <Card style={[styles.card, warn && styles.warn]}>
      <View style={styles.value}>{children}</View>
      <ThemedText type="label" themeColor="textSecondary">
        {label}
      </ThemedText>
    </Card>
  );
  if (onPress) {
    return (
      <Pressable style={styles.flex} onPress={onPress}>
        {inner}
      </Pressable>
    );
  }
  return <View style={styles.flex}>{inner}</View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.three },
  flex: { flex: 1 },
  card: {
    gap: Spacing.one,
    paddingVertical: Spacing.three,
  },
  warn: {
    borderWidth: 1.5,
    borderColor: Palette.terracotta,
    borderRadius: Radius.large,
  },
  value: {},
});
