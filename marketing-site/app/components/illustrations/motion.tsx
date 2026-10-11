'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

const MotionContext = createContext(false);

export function IllustrationMotion({ children }: { children: ReactNode }) {
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(true);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return (
    <MotionContext.Provider value={!paused && !reduced}>
      {!reduced && (
        <div className="illustration-controls">
          <button type="button" className="btn btn-ghost" onClick={() => setPaused((value) => !value)} aria-pressed={paused}>
            {paused ? 'Resume illustrations' : 'Pause illustrations'}
          </button>
        </div>
      )}
      {children}
    </MotionContext.Provider>
  );
}

/** Match the app's seconds-based clock; only tick while visible and enabled. */
export function useIllustrationClock() {
  const enabled = useContext(MotionContext);
  const ref = useRef<SVGSVGElement>(null);
  const elapsed = useRef(0);
  const [t, setTime] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    let frame = 0;
    let visible = false;
    let last = 0;
    let lastPaint = 0;
    let disposed = false;

    const tick = (now: number) => {
      if (disposed || !visible || document.hidden) return;
      if (last) elapsed.current += Math.min((now - last) / 1000, 0.1);
      last = now;
      if (now - lastPaint >= 1000 / 30) {
        setTime(elapsed.current);
        lastPaint = now;
      }
      frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      last = 0;
      if (!disposed && visible && !document.hidden) frame = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    }, { threshold: 0.05 });
    observer.observe(el);
    document.addEventListener('visibilitychange', sync);
    return () => {
      disposed = true;
      observer.disconnect();
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [enabled]);

  return { t, ref };
}
