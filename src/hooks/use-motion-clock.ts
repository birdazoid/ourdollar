import { useEffect, useState } from 'react';

import { useReduceMotion } from '@/hooks/use-reduce-motion';

// Illustration motion is slow drift, not action, so 30fps is indistinguishable
// from 60 and halves the re-renders.
const FRAME_MS = 1000 / 30;

/**
 * Seconds since mount, ticking at ~30fps, for driving the gentle loops in the
 * illustrations. Returns 0 forever when the person has Reduce Motion on, so the
 * illustration rests in its original pose.
 *
 * This re-renders the calling component each frame on purpose. Reanimated can't
 * yet animate an SVG group's transform on the UI thread (its SVG transform
 * support is unfinished), and an illustration is a handful of paths, so a
 * React re-render is cheap and behaves identically on iOS and web. Keep the
 * hook inside the illustration component so only that subtree re-renders.
 */
export function useMotionClock(): number {
  const [t, setT] = useState(0);
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (reduceMotion) return;
    let frame = 0;
    let last = 0;
    const start = Date.now();
    const loop = () => {
      const now = Date.now();
      if (now - last >= FRAME_MS) {
        last = now;
        setT((now - start) / 1000);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [reduceMotion]);

  return reduceMotion ? 0 : t;
}
