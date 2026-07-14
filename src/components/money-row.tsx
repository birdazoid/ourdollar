import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';

type Props = {
  label: string;
  value: string;
  strong?: boolean;
  sub?: boolean; // indented secondary row
  color?: string; // value color
  dot?: string; // color dot matching a chart segment
};

/** One line in an itemized money breakdown (Overview). */
export function MoneyRow({ label, value, strong, sub, color, dot }: Props) {
  return (
    <View style={[styles.row, sub && styles.sub]}>
      {dot && <View style={[styles.dot, { backgroundColor: dot }]} />}
      <ThemedText
        type={strong ? 'bodyBold' : 'body'}
        themeColor={sub ? 'textSecondary' : 'text'}
        style={styles.label}
        numberOfLines={1}>
        {label}
      </ThemedText>
      <ThemedText type={strong ? 'bodyBold' : 'body'} style={color ? { color } : undefined}>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one + 1 },
  sub: { paddingLeft: Spacing.three },
  dot: { width: 10, height: 10, borderRadius: Radius.pill },
  label: { flex: 1 },
});
