import { useEffect, useRef, useState } from 'react';

import { useReduceMotion } from '@/hooks/use-reduce-motion';

// Quick enough that nobody waits on a number, slow enough to see it move.
export const TWEEN_MS = 420;

const easeOutCubic = (u: number) => 1 - (1 - u) ** 3;

type TweenOptions = {
  /** Where to start on first mount. Omit to start at the target (no draw-in). */
  from?: number;
  duration?: number;
  /**
   * Change this to jump straight to the new target instead of animating, for
   * when the figure now describes something else (a different week, say), so
   * counting between the two would imply a change that didn't happen.
   */
  jumpKey?: string | number;
};

/**
 * A number that glides to its target whenever the target changes, so a figure
 * someone just affected visibly moves rather than silently swapping.
 *
 * The target is the truth: the animation always lands exactly on it, and it
 * is returned unchanged under Reduce Motion. Anything announced to a screen
 * reader should use the target, not this value.
 *
 * Runs on requestAnimationFrame and re-renders the caller for the length of
 * the tween only (well under half a second), which keeps it identical on iOS
 * and web and works for SVG attributes Reanimated can't drive yet.
 */
export function useTween(
  target: number,
  { from, duration = TWEEN_MS, jumpKey }: TweenOptions = {},
) {
  const reduceMotion = useReduceMotion();
  const [shown, setShown] = useState(from ?? target);
  const [shownKey, setShownKey] = useState(jumpKey);
  const current = useRef(from ?? target);

  useEffect(() => {
    let frame = 0;
    if (reduceMotion || jumpKey !== shownKey) {
      // Land immediately, but from a frame callback: setting state straight
      // from an effect body re-renders the whole screen a second time.
      frame = requestAnimationFrame(() => {
        current.current = target;
        setShown(target);
        setShownKey(jumpKey);
      });
      return () => cancelAnimationFrame(frame);
    }
    const start = current.current;
    if (start === target) return;
    const began = Date.now();
    const step = () => {
      const u = Math.min(1, (Date.now() - began) / duration);
      const v = u === 1 ? target : start + (target - start) * easeOutCubic(u);
      current.current = v;
      setShown(v);
      if (u < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, reduceMotion, jumpKey, shownKey]);

  // A new jumpKey shows its own target from the very first render, so there is
  // never a frame of the old week's figure under the new week's heading.
  if (reduceMotion || jumpKey !== shownKey) return target;
  return shown;
}
