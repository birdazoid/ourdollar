import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { Ring } from '@/components/ring';
import { ThemedText } from '@/components/themed-text';
import { Palette, Spacing } from '@/constants/theme';

type Props = {
  eyebrow: string;
  big: string;
  sub: string;
  subColor?: string;
  ringValue: number;
  ringColor?: string;
  ringLabel?: string;
};

/** White hero card with a big figure and a progress ring floated right. */
export function HeroCard({ eyebrow, big, sub, subColor, ringValue, ringColor, ringLabel }: Props) {
  return (
    <Card style={styles.card}>
      <View style={styles.left}>
        <ThemedText type="label" themeColor="textSecondary">
          {eyebrow}
        </ThemedText>
        <ThemedText type="display" style={styles.big}>
          {big}
        </ThemedText>
        <ThemedText type="label" style={{ color: subColor ?? Palette.sageDeep }}>
          {sub}
        </ThemedText>
      </View>
      <Ring value={ringValue} color={ringColor}>
        <ThemedText type="subtitle">{Math.round(ringValue * 100)}%</ThemedText>
        {ringLabel && (
          <ThemedText type="small" themeColor="textSecondary">
            {ringLabel}
          </ThemedText>
        )}
      </Ring>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.four,
  },
  left: { flex: 1, gap: Spacing.one },
  big: { marginVertical: 2 },
});
