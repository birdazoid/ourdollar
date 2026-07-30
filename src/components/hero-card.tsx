import { StyleSheet, View } from 'react-native';

import { Ring } from '@/components/ring';
import { ThemedText } from '@/components/themed-text';
import { Palette, Spacing } from '@/constants/theme';

type Props = {
  eyebrow: string;
  big: string;
  bigColor?: string;
  sub: string;
  subColor?: string;
  /** Optional second line below `sub` — e.g. a dollar-amount detail. */
  sub2?: string;
  ringValue: number;
  ringColor?: string;
  ringLabel?: string;
  ringCenter?: string; // overrides the default percentage inside the ring
};

/** White hero card with a big figure and a progress ring floated right. */
export function HeroCard({
  eyebrow,
  big,
  bigColor,
  sub,
  subColor,
  sub2,
  ringValue,
  ringColor,
  ringLabel,
  ringCenter,
}: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.left}>
        <ThemedText type="label" themeColor="textSecondary">
          {eyebrow}
        </ThemedText>
        <ThemedText type="display" style={[styles.big, bigColor ? { color: bigColor } : undefined]}>
          {big}
        </ThemedText>
        <ThemedText type="label" style={{ color: subColor ?? Palette.sageDeep }}>
          {sub}
        </ThemedText>
        {sub2 && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.sub2}>
            {sub2}
          </ThemedText>
        )}
      </View>
      <Ring value={ringValue} color={ringColor}>
        {(ringCenter ?? `${Math.round(ringValue * 100)}%`) !== '' && (
          <ThemedText type="subtitle">{ringCenter ?? `${Math.round(ringValue * 100)}%`}</ThemedText>
        )}
        {ringLabel && (
          <ThemedText type="small" themeColor="textSecondary">
            {ringLabel}
          </ThemedText>
        )}
      </Ring>
    </View>
  );
}

const styles = StyleSheet.create({
  // Transparent — the hero sits directly on the linen background (no white box).
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.four,
  },
  left: { flex: 1, gap: Spacing.one },
  big: { marginVertical: 2 },
  sub2: { marginTop: -2 },
});
