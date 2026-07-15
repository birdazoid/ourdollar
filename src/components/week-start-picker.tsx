import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

type Props = {
  value: number; // 0 = Sunday … 6 = Saturday
  onChange: (day: number) => void;
};

/** Row of seven day pills for choosing which day the week starts on. */
export function WeekStartPicker({ value, onChange }: Props) {
  return (
    <View style={styles.row}>
      {DAYS.map((label, i) => {
        const on = i === value;
        return (
          <Pressable
            key={label}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`Week starts on ${label}`}
            onPress={() => onChange(i)}
            style={[styles.pill, on && styles.pillOn]}>
            <ThemedText
              type="label"
              style={on ? styles.pillOnText : undefined}
              themeColor={on ? undefined : 'textSecondary'}>
              {label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.one },
  pill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    borderRadius: Radius.medium,
    backgroundColor: Palette.card,
  },
  pillOn: { backgroundColor: Palette.sage },
  pillOnText: { color: Palette.card },
});
