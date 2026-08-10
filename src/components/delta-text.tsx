import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette } from '@/constants/theme';
import { describeDelta } from '@/lib/money';

type Props = {
  delta: number;
  /** True where a rise is bad (bills, spending) rather than good (income). */
  invert?: boolean;
  /** Appended after the change, e.g. "vs July". */
  suffix?: string;
  type?: 'small' | 'body' | 'bodyBold';
};

/**
 * A month-over-month change, worded and coloured the same way everywhere.
 *
 * Shared because Overview and the month review each wrote their own version
 * and drifted apart: one said "$99 more" while the other said "↑ $99" for the
 * identical comparison.
 */
export function DeltaText({ delta, invert, suffix, type = 'body' }: Props) {
  const d = describeDelta(delta, { invert });
  return (
    <ThemedText
      type={type}
      themeColor={d.flat ? 'textSecondary' : undefined}
      style={d.flat ? undefined : d.good ? styles.good : styles.warn}>
      {d.text}
      {suffix ? ` ${suffix}` : ''}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  good: { color: Palette.sageDeep },
  warn: { color: Palette.terracottaDeep },
});
