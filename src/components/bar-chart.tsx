import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette, Spacing } from '@/constants/theme';

/**
 * `value: null` means "not recorded", which is not the same as zero and must
 * not be drawn as a bar of no height. A month before the household existed, or
 * one that was never closed, has no figure for bills — showing $0 there would
 * claim they paid nothing that month.
 */
export type Bar = { label: string; value: number | null };

type Props = {
  data: Bar[];
  height?: number;
  highlightLast?: boolean;
  /** Bar colour. Defaults to the sand used by the spending trend. */
  color?: string;
};

const axisFmt = (n: number) =>
  n >= 1000 ? '$' + (n / 1000).toFixed(n % 1000 ? 1 : 0) + 'k' : '$' + Math.round(n);

/** Simple vertical bar chart (react-native-svg). Last bar highlighted in sage. */
export function BarChart({ data, height = 150, highlightLast = true, color: barColor }: Props) {
  // Nulls are excluded from the scale as well as the drawing, or a run of
  // unrecorded months would drag the axis down and flatten the real bars.
  const max = Math.max(1, ...data.map((d) => d.value ?? 0));
  const plotH = height - 24; // leave room for labels
  const barGap = 8;

  return (
    <View>
      <View style={styles.row}>
        <View style={styles.yAxis}>
          <ThemedText type="small" themeColor="textSecondary">
            {axisFmt(max)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {axisFmt(max / 2)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            $0
          </ThemedText>
        </View>
        <View style={styles.plot}>
          <View style={[styles.bars, { height: plotH }]}>
            {data.map((d, i) => {
              // A month with nothing recorded gets a faint baseline tick, so
              // the gap is visibly a gap rather than a month of $0.
              if (d.value == null) {
                return (
                  <View key={d.label + i} style={[styles.barCol, { marginHorizontal: barGap / 2 }]}>
                    <View style={styles.noData} />
                  </View>
                );
              }
              const h = max > 0 ? (d.value / max) * plotH : 0;
              const isLast = i === data.length - 1;
              const color = highlightLast && isLast ? Palette.sage : barColor ?? '#E2DCC9';
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
  noData: { width: '70%', height: 2, backgroundColor: '#E2DCC9', opacity: 0.5 },
});
