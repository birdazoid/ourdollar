import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Palette } from '@/constants/theme';
import { useTween } from '@/hooks/use-tween';

type Props = {
  value: number; // 0..1
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  /**
   * What sits in the middle. Pass a function to get the ring's animated value,
   * so a percentage can count with the arc without a second animation.
   */
  children?: ReactNode | ((shown: number) => ReactNode);
};

/** Circular progress ring with centered content (design-brief §7 hero pattern). */
export function Ring({
  value,
  size = 92,
  stroke = 10,
  color = Palette.sage,
  track = '#EDE7D6',
  children,
}: Props) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  // Draws in from empty on first view, then glides to each new value.
  const v = useTween(Math.max(0, Math.min(1, value)), { from: 0, duration: 650 });
  const center = size / 2;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={center} cy={center} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <Circle
          cx={center}
          cy={center}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - v)}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <View style={StyleSheet.absoluteFill}>
        <View style={styles.center}>{typeof children === 'function' ? children(v) : children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
