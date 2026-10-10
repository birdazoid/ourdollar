import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

/**
 * Whether the person has Reduce Motion turned on, kept live. Everything that
 * moves for decoration checks this and shows its end state instead.
 *
 * The first value comes from Reanimated, which knows the setting before the
 * first frame. AccessibilityInfo only answers asynchronously, so starting from
 * it meant one frame of the animated start state (a ring reading 0%) for
 * exactly the people who asked for no motion. AccessibilityInfo then keeps it
 * current if the setting changes while the app is open.
 */
export function useReduceMotion(): boolean {
  const atLaunch = useReducedMotion();
  const [reduceMotion, setReduceMotion] = useState(atLaunch);

  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (live) setReduceMotion(on);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);

  return reduceMotion;
}
