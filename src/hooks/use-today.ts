import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { todayISO } from '@/lib/week';

// Long enough to be free, short enough that a screen left open past midnight
// catches up before anyone notices. The check itself is a string compare.
const TICK_MS = 60_000;

/**
 * Today's local date as 'YYYY-MM-DD', re-checked when the app returns to the
 * foreground and once a minute while it's open.
 *
 * Screens derive the current week/month from `new Date()` at render time, which
 * silently freezes the moment that value lands in a useMemo or a module-level
 * const: the app keeps showing whichever day it was launched on until it's
 * force-quit. Threading this through the deps makes the date an input the app
 * actually reacts to.
 *
 * Returning the SAME string when nothing changed matters — React bails out of
 * the re-render on an identical value, so the minute tick costs nothing on the
 * 1,439 minutes a day that aren't midnight.
 */
export function useToday(): string {
  const [today, setToday] = useState(todayISO);

  useEffect(() => {
    const sync = () => setToday((prev) => (todayISO() === prev ? prev : todayISO()));
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    const timer = setInterval(sync, TICK_MS);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, []);

  return today;
}
