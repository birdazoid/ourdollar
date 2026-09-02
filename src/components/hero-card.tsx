import { StyleSheet, View } from 'react-native';

import { Ring } from '@/components/ring';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Palette, Spacing } from '@/constants/theme';

type Props = {
  eyebrow: string;
  big: string;
  bigColor?: string;
  /**
   * Optional line under the big figure. The Bills hero leaves it out: its "11
   * of 31" already ends in a countable noun, so a green "paid" beneath it
   * repeated the eyebrow and spent the card's one accent colour on a word
   * rather than on a number.
   */
  sub?: string;
  subColor?: string;
  /**
   * The green, load-bearing part of the detail line — the figure worth
   * noticing. Rendered before `sub2` on the same line.
   */
  sub2Accent?: string;
  /** The rest of the detail line, in secondary text. */
  sub2?: string;
  /**
   * A second detail line. Its own line rather than more of `sub2`, because
   * joining them with a separator wrapped mid-clause and stranded the "·" at
   * the end of a line.
   */
  sub3?: string;
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
  sub2Accent,
  sub2,
  sub3,
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
        {sub && (
          <ThemedText type="label" style={{ color: subColor ?? Palette.sageDeep }}>
            {sub}
          </ThemedText>
        )}
        {(sub2Accent || sub2) && (
          // One Text, not two views: the accent and the rest have to flow and
          // wrap as a single sentence, which nested Text does and a row of
          // separate Texts doesn't.
          <ThemedText type="small" themeColor="textSecondary" style={styles.sub2}>
            {sub2Accent && <ThemedText type="small" style={styles.sub2Accent}>{sub2Accent}</ThemedText>}
            {sub2Accent && sub2 ? ' ' : ''}
            {sub2}
          </ThemedText>
        )}
        {sub3 && (
          <ThemedText type="small" themeColor="textSecondary">
            {sub3}
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
  sub2Accent: { color: Palette.sageDeep, fontFamily: Fonts.sans.bold },
});
