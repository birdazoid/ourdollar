import { Pressable, StyleSheet, View } from 'react-native';

import { Palette, Radius } from '@/constants/theme';

type Props = {
  value: boolean;
  onValueChange: (v: boolean) => void;
  onColor?: string;
  accessibilityLabel?: string;
};

export function Switch({ value, onValueChange, onColor = Palette.sage, accessibilityLabel }: Props) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={accessibilityLabel}
      onPress={() => onValueChange(!value)}
      style={[styles.track, { backgroundColor: value ? onColor : 'rgba(61,64,91,0.15)' }]}>
      <View style={[styles.knob, value && styles.knobOn]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 48,
    height: 28,
    borderRadius: Radius.pill,
    padding: 3,
    justifyContent: 'center',
  },
  knob: {
    width: 22,
    height: 22,
    borderRadius: Radius.pill,
    backgroundColor: Palette.card,
  },
  knobOn: { alignSelf: 'flex-end' },
});
