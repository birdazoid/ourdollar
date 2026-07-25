import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette, Radius, Spacing } from '@/constants/theme';

/** Full-screen fallback for when a required load fails, so nobody is ever
 * stuck staring at a spinner with no way forward. */
export function RetryScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <ThemedView style={styles.fill}>
      <View style={styles.body}>
        <ThemedText type="display">🌧️</ThemedText>
        <ThemedText type="title" style={styles.center}>
          Couldn&apos;t load
        </ThemedText>
        <ThemedText type="body" themeColor="textSecondary" style={styles.center}>
          Check your connection and try again.
        </ThemedText>
        <Pressable accessibilityRole="button" onPress={onRetry} style={styles.btn}>
          <ThemedText type="bodyBold" style={styles.btnText}>
            Try again
          </ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, paddingHorizontal: Spacing.five },
  center: { textAlign: 'center' },
  btn: {
    marginTop: Spacing.three,
    backgroundColor: Palette.sageDeep,
    borderRadius: Radius.large,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.five,
  },
  btnText: { color: Palette.card },
});
