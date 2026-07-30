import { Fingerprint } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette, Radius, Spacing } from '@/constants/theme';

export function BiometricLockScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.overlay}>
      <ThemedView style={styles.fill}>
        <SafeAreaView style={styles.fill}>
          <Pressable style={styles.content} onPress={onRetry} accessibilityRole="button">
            <View style={styles.iconWrap}>
              <Fingerprint size={40} color={Palette.sageDeep} />
            </View>
            <ThemedText type="title">OurDollar is locked</ThemedText>
            <ThemedText type="body" themeColor="textSecondary" style={styles.tagline}>
              Use Face ID or Touch ID to continue.
            </ThemedText>
            <Button title="Unlock" onPress={onRetry} style={styles.button} />
          </Pressable>
        </SafeAreaView>
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  fill: { flex: 1 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  iconWrap: {
    width: 76,
    height: 76,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(129,178,154,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  tagline: { textAlign: 'center' },
  button: { marginTop: Spacing.four, alignSelf: 'stretch' },
});
