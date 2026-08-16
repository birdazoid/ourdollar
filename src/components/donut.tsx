import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

export type DonutSegment = { value: number; color: string };

type Props = {
  segments: DonutSegment[];
  size?: number;
  stroke?: number;
  gap?: number; // degrees of gap between segments
  children?: ReactNode;
};

/** Multi-segment donut. Each segment is an arc drawn with strokeDasharray,
 *  rotated to its cumulative start angle. Center content via children. */
/**
 * Smallest arc a non-zero segment may draw, in degrees. Below this it's a
 * hairline, but a hairline is honest where nothing at all is not: a $50 goal
 * against $8,504 of income is 2.1°, less than the inter-segment gap, so
 * subtracting the gap took its dash to zero. It reserved angular space and
 * drew nothing, reading as if the household had no savings goal.
 */
const MIN_ARC_DEGREES = 1.5;

export function Donut({ segments, size = 168, stroke = 26, gap = 3, children }: Props) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const center = size / 2;
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;

  // Start angles precomputed rather than accumulated inside the map: a `let`
  // reassigned from a render callback makes the React Compiler bail out of
  // optimising this component entirely.
  const starts = segments.reduce<number[]>((acc, _seg, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + segments[i - 1].value / total);
    return acc;
  }, []);

  const arcs = segments.map((seg, i) => {
    const frac = seg.value / total;
    const startAngle = starts[i] * 360;
    // Shrink the visible dash slightly to create a gap between segments.
    const gapFrac = gap / 360;
    // Never let the gap eat a real segment entirely — floor it at a hairline
    // and never let that floor exceed the segment's own share.
    const floor = seg.value > 0 ? Math.min((MIN_ARC_DEGREES / 360) * circ, frac * circ) : 0;
    const dash = Math.max(floor, (frac - gapFrac) * circ);
    return (
      <Circle
        key={i}
        cx={center}
        cy={center}
        r={r}
        stroke={seg.color}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="butt"
        transform={`rotate(${startAngle - 90} ${center} ${center})`}
      />
    );
  });

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {arcs}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
