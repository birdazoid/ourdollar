import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

// One-time explainers, tracked per account on this device.
//
// Per ACCOUNT rather than per household: an explainer about how the app works
// is something a person reads once, and both members of a household each need
// to see it. Device-local rather than server-side because it's a UI
// preference, not shared state worth a column and a round-trip.

export const NOTICE_WEEKLY_PERIODS = 'weekly-periods-v1';

const key = (accountId: string, notice: string) => `ourdollar.notice.${notice}.${accountId}`;

export async function hasSeenNotice(accountId: string, notice: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(key(accountId, notice))) === '1';
  } catch {
    // A storage failure should never block the app. Treating it as "seen"
    // risks silence; treating it as "unseen" risks repeating a one-time
    // notice. Silence is worse for a notice that explains a changed number.
    return false;
  }
}

export async function markNoticeSeen(accountId: string, notice: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key(accountId, notice), '1');
  } catch {
    // Non-fatal: worst case the notice shows again next launch.
  }
}

/**
 * Whether a one-time notice should be shown, plus a dismiss that persists.
 * Returns false until the check resolves, so nothing flashes on launch.
 */
export function useOneTimeNotice(accountId: string | null, notice: string) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let active = true;
    if (!accountId) {
      setShow(false);
      return;
    }
    hasSeenNotice(accountId, notice).then((seen) => {
      if (active) setShow(!seen);
    });
    return () => {
      active = false;
    };
  }, [accountId, notice]);

  const dismiss = useCallback(() => {
    setShow(false);
    if (accountId) markNoticeSeen(accountId, notice);
  }, [accountId, notice]);

  return { show, dismiss };
}
