import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import { useSession } from '@/lib/auth';
import { claimPendingInvites } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import type { Household } from '@/lib/types';

type HouseholdContextValue = {
  householdId: string | null;
  household: Household | null;
  households: Household[];
  isLoading: boolean;
  setActiveHousehold: (id: string) => void;
};

const HouseholdContext = createContext<HouseholdContextValue | null>(null);

export function useHousehold() {
  const value = useContext(HouseholdContext);
  if (!value) {
    throw new Error('useHousehold must be used within a <HouseholdProvider />');
  }
  return value;
}

const activeKey = (userId: string) => `ourdollar.activeHousehold.${userId}`;

// RLS already scopes households to the current user (owned or member-of), so a
// plain select returns exactly the ones they can see.
export function HouseholdProvider({ children }: PropsWithChildren) {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const qc = useQueryClient();

  const [activeId, setActiveIdState] = useState<string | null>(null);
  // Gate: on login we first try to claim any invites addressed to this user's
  // email, so an invited-then-registered person doesn't briefly see the
  // "create your first household" empty state before their household appears.
  const [claimSettled, setClaimSettled] = useState(false);

  useEffect(() => {
    if (!userId) {
      setClaimSettled(false);
      setActiveIdState(null);
      return;
    }
    let cancelled = false;
    // Restore the last-active household for this account.
    AsyncStorage.getItem(activeKey(userId))
      .then((stored) => {
        if (!cancelled && stored) setActiveIdState(stored);
      })
      .catch(() => {});
    // Claim invites, then refresh the household list to include any joined.
    claimPendingInvites()
      .then((claimed) => {
        if (cancelled) return;
        if (claimed > 0) qc.invalidateQueries({ queryKey: ['households'] });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setClaimSettled(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, qc]);

  const { data: households = [], isLoading: householdsLoading } = useQuery({
    queryKey: ['households', userId],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('households')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as Household[];
    },
  });

  const setActiveHousehold = useCallback(
    (id: string) => {
      setActiveIdState(id);
      if (userId) AsyncStorage.setItem(activeKey(userId), id).catch(() => {});
    },
    [userId]
  );

  // Fall back to the first household if the stored/active one isn't visible
  // (e.g. it was left or deleted, or hasn't loaded yet).
  const activeIsVisible = activeId != null && households.some((h) => h.id === activeId);
  const householdId = (activeIsVisible ? activeId : households[0]?.id) ?? null;
  const household = households.find((h) => h.id === householdId) ?? null;

  // Not "ready" until invites are claimed AND the (possibly refetched) list has
  // loaded — otherwise the empty state can flash for invited users.
  const isLoading = !!session && (!claimSettled || householdsLoading);

  const value = useMemo<HouseholdContextValue>(
    () => ({ householdId, household, households, isLoading, setActiveHousehold }),
    [householdId, household, households, isLoading, setActiveHousehold]
  );

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}
