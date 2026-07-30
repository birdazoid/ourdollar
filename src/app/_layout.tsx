import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { BiometricLockScreen } from '@/components/biometric-lock-screen';
import { FontsToLoad } from '@/constants/theme';
import { SessionProvider, useSession } from '@/lib/auth';
import { useBiometricLock } from '@/lib/use-biometric-lock';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
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
    </>
  );
}
