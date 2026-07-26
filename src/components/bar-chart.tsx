import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette, Spacing } from '@/constants/theme';

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
              const h = max > 0 ? (d.value / max) * plotH : 0;
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
