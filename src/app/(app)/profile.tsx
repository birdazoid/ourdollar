import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth';

// Stub — full profile (household, members, account actions) is a later Phase 2 chunk.
export default function ProfileScreen() {
  const router = useRouter();
  const { session, signOut } = useSession();

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.content}>
        <ThemedText type="title">Profile</ThemedText>
        <ThemedText type="body" themeColor="textSecondary">
          {session?.user.email}
        </ThemedText>
        <View style={styles.actions}>
          <Button title="Sign out" variant="secondary" onPress={signOut} />
          <Button title="Back" variant="secondary" onPress={() => router.back()} />
        </View>
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
  actions: {
    alignSelf: 'stretch',
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
});
