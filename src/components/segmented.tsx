import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  type SharedValue,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';

export type SegmentedOption<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  /**
   * Wrap onto multiple rows instead of squeezing everything into one. For more
   * than about three options, single-row segments get too narrow to read their
   * own labels.
   */
  wrap?: boolean;
};

const PAD = 3;
const GAP = 3;

/**
 * Pill segmented control. The active segment fills with ink, and on a single
 * row that ink slides across to the new choice. Wrapped controls swap in
 * place: an indicator sliding diagonally between rows reads as noise.
 */
export function Segmented<T extends string>({ value, options, onChange, wrap }: Props<T>) {
  const theme = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const sliding = !wrap && trackWidth > 0;
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const segWidth = sliding
    ? (trackWidth - PAD * 2 - GAP * (options.length - 1)) / options.length
    : 0;

  // Slides between choices, but appears in place when the track is first
  // measured (or resized), so a screen never opens with the ink gliding in.
  const measuredWidth = useSharedValue(0);
  const x = useDerivedValue(() => {
    const target = index * (segWidth + GAP);
    if (measuredWidth.value !== segWidth) {
      measuredWidth.value = segWidth;
      return target;
    }
    return withTiming(target, { duration: 220 });
  }, [index, segWidth]);
  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      style={[styles.track, wrap && styles.trackWrap]}
      onLayout={wrap ? undefined : (e) => setTrackWidth(e.nativeEvent.layout.width)}
    >
      {sliding && <Animated.View style={[styles.indicator, { width: segWidth }, indicator]} />}
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (!active) haptic.select();
              onChange(opt.value);
            }}
            style={[
              styles.segment,
              wrap && styles.segmentWrap,
              // Until the track is measured there's no indicator, so the
              // active segment paints itself; afterwards the indicator does.
              active && !sliding && styles.segmentActive,
            ]}
          >
            {sliding ? (
              <SlidingLabel
                x={x}
                at={options.indexOf(opt) * (segWidth + GAP)}
                span={segWidth + GAP}
                inactive={theme.textSecondary}
              >
                {opt.label}
              </SlidingLabel>
            ) : (
              <ThemedText
                type="label"
                style={active ? styles.labelActive : undefined}
                themeColor={active ? undefined : 'textSecondary'}
              >
                {opt.label}
              </ThemedText>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * A label whose colour follows the sliding ink: light while the ink is under
 * it, back to grey as the ink leaves. Swapping colours the instant the choice
 * changes flashes white text on the pale track until the ink arrives.
 */
function SlidingLabel({
  x,
  at,
  span,
  inactive,
  children,
}: {
  x: SharedValue<number>;
  at: number;
  span: number;
  inactive: string;
  children: string;
}) {
  const colour = useAnimatedStyle(() => ({
    color: interpolateColor(
      Math.min(1, Math.abs(x.value - at) / span),
      [0, 1],
      [Palette.card, inactive],
    ),
  }));
  return <Animated.Text style={[Type.label, colour]}>{children}</Animated.Text>;
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: 'rgba(61,64,91,0.06)',
    borderRadius: Radius.medium,
    padding: PAD,
    gap: GAP,
  },
  trackWrap: { flexWrap: 'wrap' },
  indicator: {
    position: 'absolute',
    left: PAD,
    top: PAD,
    bottom: PAD,
    borderRadius: Radius.medium - 2,
    backgroundColor: Palette.ink,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.medium - 2,
  },
  // Two per row: just under half, leaving room for the 3px gap.
  segmentWrap: { flexBasis: '48%', flexGrow: 1 },
  segmentActive: {
    backgroundColor: Palette.ink,
  },
  labelActive: {
    color: Palette.card,
  },
});
