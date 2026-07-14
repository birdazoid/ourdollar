import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';

export type SegmentedOption<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
};

/** Pill segmented control — active segment fills with ink. */
export function Segmented<T extends string>({ value, options, onChange }: Props<T>) {
  return (
    <View style={styles.track}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(opt.value)}
            style={[styles.segment, active && styles.segmentActive]}>
            <ThemedText
              type="label"
              style={active ? styles.labelActive : undefined}
              themeColor={active ? undefined : 'textSecondary'}>
              {opt.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: 'rgba(61,64,91,0.06)',
    borderRadius: Radius.medium,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.medium - 2,
  },
  segmentActive: {
    backgroundColor: Palette.ink,
  },
  labelActive: {
    color: Palette.card,
  },
});
