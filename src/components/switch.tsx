import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';

import { Palette, Radius } from '@/constants/theme';
import { haptic } from '@/lib/haptics';

type Props = {
  value: boolean;
  onValueChange: (v: boolean) => void;
  onColor?: string;
  accessibilityLabel?: string;
};

const OFF_COLOR = 'rgba(61,64,91,0.15)';
// Track width minus padding on both sides minus the knob.
const TRAVEL = 48 - 3 * 2 - 22;

export function Switch({ value, onValueChange, onColor = Palette.sage, accessibilityLabel }: Props) {
  // The knob slides and the track tints together. Reanimated lands both
  // instantly under Reduce Motion.
  const on = useDerivedValue(() => withTiming(value ? 1 : 0, { duration: 180 }), [value]);
  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [OFF_COLOR, onColor]),
  }));
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: on.value * TRAVEL }] }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        haptic.select();
        onValueChange(!value);
      }}>
      <Animated.View style={[styles.track, track]}>
        <Animated.View style={[styles.knob, knob]} />
      </Animated.View>
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
});
