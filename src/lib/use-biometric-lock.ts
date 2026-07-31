import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { authenticateWithBiometrics, isBiometricLockEnabled, isBiometricPromptActive } from '@/lib/biometrics';

// Gates the app behind Face ID / Touch ID on cold launch and whenever the
// app returns to the foreground, but only for a signed-in user who has
// opted in (per-account SecureStore flag, checked in biometrics.ts).
export function useBiometricLock(session: Session | null) {
  const [locked, setLocked] = useState(false);
  // Key off the user id, not the session object: Supabase hands back a fresh
  // session object on every token refresh, and depending on that object made
  // `attempt` change identity — re-running the mount effect and firing an
  // unprompted Face ID sheet on a schedule the user never asked for.
  const userId = session?.user.id ?? null;

  const attempt = useCallback(async () => {
    if (!userId) {
      setLocked(false);
      return;
    }
    // Never stack a prompt on one that's already up (or still dismissing) —
    // including one started elsewhere, like Profile's "confirm to enable".
    if (isBiometricPromptActive()) return;
    const enabled = await isBiometricLockEnabled(userId);
    if (!enabled) {
      setLocked(false);
      return;
    }
    setLocked(true);
    const ok = await authenticateWithBiometrics('Unlock OurDollar');
    if (ok) setLocked(false);
  }, [userId]);

  useEffect(() => {
    attempt();
  }, [attempt]);

  const appState = useRef(AppState.currentState);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appState.current;
      appState.current = next;
      // Only a genuine return from the background should re-lock. The native
      // biometric sheet drives active -> inactive -> active (the same shape as
      // the notification shade), so treating every 'active' as a return meant
      // enabling the toggle re-prompted itself indefinitely.
      if (next === 'active' && prev === 'background') attempt();
    });
    return () => sub.remove();
  }, [attempt]);

  return { locked, retry: attempt };
}
