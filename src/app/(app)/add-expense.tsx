import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

// Stub — the full Add Expense flow is built with the Week screen.
export default function AddExpenseScreen() {
  const router = useRouter();
  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.content}>
        <ThemedText type="title">Add expense</ThemedText>
        <ThemedText type="body" themeColor="textSecondary" style={styles.note}>
          Expense logging arrives with the Week screen.
        </ThemedText>
        <Button title="Close" variant="secondary" onPress={() => router.back()} />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  note: { textAlign: 'center' },
});
