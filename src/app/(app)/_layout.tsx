import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { FirstHousehold } from '@/components/first-household';
import { ThemedView } from '@/components/themed-view';
import { Palette } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { HouseholdProvider, useHousehold } from '@/lib/household';
import { syncPushToken } from '@/lib/notifications';

export default function AppLayout() {
  const { session } = useSession();

  // Register this device for push on first authed load (design-brief §2).
  useEffect(() => {
    const accountId = session?.user.id;
    if (accountId) {
      syncPushToken(accountId).catch(() => {});
    }
  }, [session?.user.id]);

  return (
    <HouseholdProvider>
      <HouseholdGate />
    </HouseholdProvider>
  );
}

// Decides what an authed user sees based on their household membership:
// nothing while loading, the create-your-first-household screen if they belong
// to none, otherwise the normal app stack.
function HouseholdGate() {
  const { isLoading, households } = useHousehold();

  if (isLoading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={Palette.sageDeep} />
      </ThemedView>
    );
  }

  if (households.length === 0) {
    return <FirstHousehold />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="profile" options={{ presentation: 'card' }} />
      <Stack.Screen name="add-expense" options={{ presentation: 'modal' }} />
      <Stack.Screen name="onboarding" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
