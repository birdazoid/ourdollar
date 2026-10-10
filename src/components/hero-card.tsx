import { StyleSheet, View } from 'react-native';

import { Ring } from '@/components/ring';
import { ThemedText } from '@/components/themed-text';
import { Palette, Spacing } from '@/constants/theme';
import { useTween } from '@/hooks/use-tween';

type Props = {
  eyebrow: string;
  big: string;
  /**
   * The number behind `big`, when it has one. Given this and `formatBig`, the
   * figure counts to each new value instead of swapping, so logging an expense
   * visibly takes it off. `big` stays the screen-reader text.
   */
  bigValue?: number;
  formatBig?: (n: number) => string;
  /** Change to show a new figure without counting (a different week, say). */
  jumpKey?: string | number;
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
  bigValue,
  formatBig,
  jumpKey,
  bigColor,
  sub,
  subColor,
  sub2,
  ringValue,
  ringColor,
  ringLabel,
  ringCenter,
}: Props) {
  const counted = useTween(bigValue ?? 0, { jumpKey });
  const bigText = bigValue != null && formatBig ? formatBig(counted) : big;
  // The ring's own percentage counts alongside its arc.
  const ringShown = useTween(ringValue, { from: 0, duration: 650 });
  const ringText = ringCenter ?? `${Math.round(ringShown * 100)}%`;

  return (
    <View style={styles.card}>
      <View style={styles.left}>
        <ThemedText type="label" themeColor="textSecondary">
          {eyebrow}
        </ThemedText>
        <ThemedText
          type="display"
          accessibilityLabel={big}
          style={[styles.big, bigColor ? { color: bigColor } : undefined]}>
          {bigText}
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
        {ringText !== '' && <ThemedText type="subtitle">{ringText}</ThemedText>}
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
