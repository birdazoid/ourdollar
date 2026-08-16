import { focusManager, MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { BiometricLockScreen } from '@/components/biometric-lock-screen';
import { ToastHost } from '@/components/toast-host';
import { FontsToLoad } from '@/constants/theme';
import { SessionProvider, useSession } from '@/lib/auth';
import { describeWriteError, showToast } from '@/lib/toast';
import { useBiometricLock } from '@/lib/use-biometric-lock';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
    /**
     * Writes are NOT retried, on purpose.
     *
     * None of the mutations carry an idempotency key, so a request that
     * reached Postgres and then lost its response is indistinguishable from
     * one that never arrived. Retrying would log the same expense twice, and
     * a duplicate that silently inflates the week is worse than an error the
     * household can see and act on. The failure is reported instead, and the
     * screens that write keep their form open so trying again is one tap.
     */
    mutations: { retry: 0 },
  },
  /**
   * Every failed write reports itself. Before this, all 42 mutations were
   * fire-and-forget: the sheet closed, the screen navigated, and an expense
   * that never saved looked exactly like one that did.
   */
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      // Background bookkeeping opts out with meta.silent. Reporting a write the
      // household never initiated is noise they can't act on.
      if (mutation.meta?.silent) return;
      showToast(describeWriteError(error));
    },
  }),
});

// React Query's "focus" detection defaults to the browser's visibilitychange
// event, which doesn't exist on native — without this, queries never treat a
// foregrounded app as a reason to refetch stale data (e.g. after the app sat
// backgrounded and a request never got the chance to complete).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    focusManager.setFocused(state === 'active');
  });
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts(FontsToLoad);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <RootNavigator />
      </SessionProvider>
    </QueryClientProvider>
  );
}

function RootNavigator() {
  const { session, isLoading, isRecovery } = useSession();
  // Don't gate a password-recovery session behind Face ID — the user just
  // proved identity via the emailed link, and still needs to set a password.
  const { locked, retry } = useBiometricLock(isRecovery ? null : session);

  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  if (isLoading) {
    return null;
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        {/* A password-recovery deep link sets a session, but the user must set
            a new password before doing anything else — this branch takes over
            regardless of session state until clearRecovery() runs. */}
        <Stack.Protected guard={isRecovery}>
          <Stack.Screen name="reset-password" />
        </Stack.Protected>

        <Stack.Protected guard={!isRecovery && !!session}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>

        <Stack.Protected guard={!isRecovery && !session}>
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="forgot-password" />
        </Stack.Protected>
      </Stack>
      {locked && <BiometricLockScreen onRetry={retry} />}
      {/* Last, so a failed write is reported over whatever is on screen —
          including a sheet that has just closed itself. */}
      <ToastHost />
    </>
  );
}
