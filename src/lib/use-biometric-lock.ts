import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { authenticateWithBiometrics, isBiometricLockEnabled, isBiometricPromptRecent } from '@/lib/biometrics';

// Gates the app behind Face ID / Touch ID on cold launch and whenever the
// app returns to the foreground, but only for a signed-in user who has
// opted in (per-account SecureStore flag, checked in biometrics.ts).
export function useBiometricLock(session: Session | null) {
  const [locked, setLocked] = useState(false);

  const attempt = useCallback(async () => {
    if (!session) {
      setLocked(false);
      return;
    }
    // The native Face ID/Touch ID sheet itself backgrounds and re-foregrounds
    // the app as it shows and dismisses — including for a prompt fired from
    // elsewhere (e.g. Profile's "confirm to enable" flow). Without this guard,
    // that transition re-triggers this same effect, which fires ANOTHER
    // prompt, which triggers another transition — a loop that only stops when
    // the user gives up and disables the setting.
    if (isBiometricPromptRecent()) return;
    const enabled = await isBiometricLockEnabled(session.user.id);
    if (!enabled) {
      setLocked(false);
      return;
    }
    setLocked(true);
    const ok = await authenticateWithBiometrics('Unlock OurDollar');
    if (ok) setLocked(false);
  }, [session]);

  useEffect(() => {
    attempt();
  }, [attempt]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') attempt();
    });
    return () => sub.remove();
  }, [attempt]);

  return { locked, retry: attempt };
}
