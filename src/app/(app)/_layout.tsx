import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { FirstHousehold } from '@/components/first-household';
import { InviteInbox, InviteWelcome } from '@/components/invites';
import { MonthAutoClose } from '@/components/month-auto-close';
import { ProfileSetup } from '@/components/profile-setup';
import { RetryScreen } from '@/components/retry-screen';
import { ThemedView } from '@/components/themed-view';
import { WeeklyPeriodsNotice } from '@/components/weekly-periods-notice';
import { Palette } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { HouseholdProvider, useHousehold } from '@/lib/household';
import { syncPushToken } from '@/lib/notifications';
import { applyPendingMarketingOptIn, useAccount } from '@/lib/queries';

export default function AppLayout() {
  const { session } = useSession();

  // Register this device for push + apply any pending marketing consent from
  // sign-up, on first authed load (design-brief §2).
  useEffect(() => {
    const accountId = session?.user.id;
    if (accountId) {
      syncPushToken(accountId).catch(() => {});
      applyPendingMarketingOptIn(accountId).catch(() => {});
    }
  }, [session?.user.id]);

  return (
    <HouseholdProvider>
      <RootGate />
    </HouseholdProvider>
  );
}

// Before any household logic: a signed-in account with no profile name yet is a
// brand-new user — send them through one-time profile setup (name + avatar).
function RootGate() {
  const { session } = useSession();
  const account = useAccount(session?.user.id ?? null);

  if (account.isLoading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={Palette.sageDeep} />
      </ThemedView>
    );
  }

  if (account.isError) {
    return <RetryScreen onRetry={() => account.refetch()} />;
  }

  if (account.data && !account.data.name?.trim()) {
    return <ProfileSetup />;
  }

  return <HouseholdGate />;
}

// Decides what an authed user sees based on their household membership:
// nothing while loading, the create-your-first-household screen if they belong
// to none, otherwise the normal app stack.
function HouseholdGate() {
  const { isLoading, isError, retry, households, pendingInvites } = useHousehold();

  if (isLoading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={Palette.sageDeep} />
      </ThemedView>
    );
  }

  if (isError) {
    return <RetryScreen onRetry={retry} />;
  }

  // No household yet: an invited user gets the accept/decline welcome; everyone
  // else gets the create-your-first-household step.
  if (households.length === 0) {
    return pendingInvites.length > 0 ? <InviteWelcome /> : <FirstHousehold />;
  }

  // Already in a household: run the app, and surface any waiting invite as an
  // overlay (e.g. an existing user invited to a second household).
  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="profile" options={{ presentation: 'card' }} />
        <Stack.Screen name="add-expense" options={{ presentation: 'modal' }} />
        <Stack.Screen name="onboarding" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
        <Stack.Screen name="month-review" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
      </Stack>
      <InviteInbox />
      <MonthAutoClose />
      <WeeklyPeriodsNotice />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
