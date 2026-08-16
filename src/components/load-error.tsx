import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';

/**
 * Shown in place of a tab's body when its data failed to load.
 *
 * Without it a failed refetch left `data` undefined, the `?? []` fallbacks
 * took over, and the screen rendered its EMPTY state: "Nothing logged for this
 * week yet" on a week with plenty logged. Reading that as data loss is the
 * only reasonable interpretation, hence the reassurance line.
 *
 * Deliberately a card rather than RetryScreen's full-screen takeover, so the
 * header and tab bar stay put and the household can move to a tab that did
 * load.
 */
export function LoadError({ onRetry, what = 'this' }: { onRetry: () => void; what?: string }) {
  return (
    <Card style={styles.card}>
      <ThemedText type="subtitle">Couldn&apos;t load {what}</ThemedText>
      <ThemedText type="body" themeColor="textSecondary" style={styles.body}>
        Check your connection and try again. Nothing has been lost, this screen just
        couldn&apos;t fetch it.
      </ThemedText>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Try loading ${what} again`}
          onPress={onRetry}
          style={styles.btn}>
          <ThemedText type="bodyBold" style={styles.btnText}>
            Try again
          </ThemedText>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five, marginTop: Spacing.three },
  body: { textAlign: 'center' },
  actions: { marginTop: Spacing.one },
  btn: {
    backgroundColor: Palette.sageDeep,
    borderRadius: Radius.large,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.four,
  },
  btnText: { color: Palette.card },
});
