import { Stack } from 'expo-router';
import { useEffect } from 'react';

import { useSession } from '@/lib/auth';
import { HouseholdProvider } from '@/lib/household';
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
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="profile" options={{ presentation: 'card' }} />
        <Stack.Screen name="add-expense" options={{ presentation: 'modal' }} />
      </Stack>
    </HouseholdProvider>
  );
}
