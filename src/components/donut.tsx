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
export function Donut({ segments, size = 168, stroke = 26, gap = 3, children }: Props) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const center = size / 2;
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;

  let cumulative = 0;
  const arcs = segments.map((seg, i) => {
    const frac = seg.value / total;
    const startAngle = cumulative * 360;
    cumulative += frac;
    // Shrink the visible dash slightly to create a gap between segments.
    const gapFrac = gap / 360;
    const dash = Math.max(0, (frac - gapFrac) * circ);
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
