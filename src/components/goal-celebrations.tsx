import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef } from 'react';

import { celebrate } from '@/lib/celebrate';
import { fmt } from '@/lib/money';
import { useHousehold } from '@/lib/household';
import { useGoals } from '@/lib/queries';

const celebratedKey = (goalId: string) => `ourdollar.goalCelebrated.${goalId}`;

/**
 * Invisible. Mounted once with the app (see (app)/_layout.tsx) and watches the
 * household's goals for one moving from short of its target to reaching it,
 * however that happened: a monthly contribution, income sent to it, or last
 * week's leftovers.
 *
 * Only a change seen while the app is open counts. A goal that was already
 * funded when the app loaded isn't news. Each goal is celebrated once ever on
 * this device, so nudging a target down and back up can't replay it.
 */
export function GoalCelebrations() {
  const { householdId } = useHousehold();
  const goals = useGoals(householdId);
  // goal id -> whether it was funded when last seen
  const seen = useRef(new Map<string, boolean>());

  useEffect(() => {
    for (const g of goals.data ?? []) {
      const funded = g.target_amount > 0 && g.saved_amount >= g.target_amount;
      const before = seen.current.get(g.id);
      seen.current.set(g.id, funded);
      if (before !== false || !funded) continue;
      AsyncStorage.getItem(celebratedKey(g.id))
        .then((done) => {
          if (done) return;
          AsyncStorage.setItem(celebratedKey(g.id), '1').catch(() => {});
          celebrate(`${g.name} is fully funded`, `You saved all ${fmt(g.target_amount)}.`);
        })
        .catch(() => {});
    }
  }, [goals.data]);

  return null;
}
