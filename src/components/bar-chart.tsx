import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette, Spacing } from '@/constants/theme';
import { useTween } from '@/hooks/use-tween';

export type Bar = { label: string; value: number };

type Props = {
  data: Bar[];
  height?: number;
  highlightLast?: boolean;
};

const axisFmt = (n: number) =>
  n >= 1000 ? '$' + (n / 1000).toFixed(n % 1000 ? 1 : 0) + 'k' : '$' + Math.round(n);

/** Simple vertical bar chart (react-native-svg). Last bar highlighted in sage. */
export function BarChart({ data, height = 150, highlightLast = true }: Props) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const hasData = data.some((d) => d.value > 0);
  const plotH = height - 24; // leave room for labels
  const barGap = 8;
  // Bars rise from the baseline on first view, left to right, and re-rise when
  // the range changes, since that's a different set of months.
  const rise = useTween(1, { from: 0, duration: 700 });
  const grow = (i: number) => {
    const lag = data.length > 1 ? (i / (data.length - 1)) * 0.35 : 0;
    const u = Math.min(1, Math.max(0, (rise - lag) / 0.65));
    return 1 - (1 - u) ** 3;
  };

  return (
    <View>
      <View style={styles.row}>
        <View style={styles.yAxis}>
          {/* With nothing logged, `max` is a placeholder 1 and the scale read
              "$1 / $1 / $0". An empty chart only needs its baseline. */}
          <ThemedText type="small" themeColor="textSecondary">
            {hasData ? axisFmt(max) : ''}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {hasData ? axisFmt(max / 2) : ''}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            $0
          </ThemedText>
        </View>
        <View style={styles.plot}>
          <View style={[styles.bars, { height: plotH }]}>
            {data.map((d, i) => {
              const h = max > 0 ? (d.value / max) * plotH * grow(i) : 0;
              const isLast = i === data.length - 1;
              const color = highlightLast && isLast ? Palette.sage : '#E2DCC9';
              return (
                <View key={d.label + i} style={[styles.barCol, { marginHorizontal: barGap / 2 }]}>
                  <View style={{ width: '70%', height: Math.max(2, h), backgroundColor: color, borderTopLeftRadius: 6, borderTopRightRadius: 6 }} />
                </View>
              );
            })}
          </View>
          <View style={styles.labelRow}>
            {data.map((d, i) => (
              <View key={d.label + i} style={[styles.barCol, { marginHorizontal: barGap / 2 }]}>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {d.label}
                </ThemedText>
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.two },
  yAxis: { justifyContent: 'space-between', paddingVertical: 2, height: 150 - 24, alignItems: 'flex-end' },
  plot: { flex: 1 },
  bars: { flexDirection: 'row', alignItems: 'flex-end' },
  barCol: { flex: 1, alignItems: 'center' },
  labelRow: { flexDirection: 'row', marginTop: Spacing.one },
});
