import type { GestureResponderEvent, PressableProps, StyleProp, ViewStyle } from 'react-native';
import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** How far it shrinks while held. Larger targets want less. */
  scaleTo?: number;
};

/**
 * A Pressable that dips slightly while a finger is on it, so every tap
 * visibly lands. Runs on the UI thread, and Reanimated skips the motion under
 * Reduce Motion.
 */
export function PressableScale({ style, scaleTo = 0.97, onPressIn, onPressOut, ...rest }: Props) {
  const held = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (1 - scaleTo) * held.value }],
    opacity: 1 - 0.1 * held.value,
  }));

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e: GestureResponderEvent) => {
        held.value = withTiming(1, { duration: 90 });
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        held.value = withTiming(0, { duration: 180 });
        onPressOut?.(e);
      }}
      style={[style, animated]}
    />
  );
}
