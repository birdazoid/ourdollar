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
import { AppState } from 'react-native';

import { useSession } from '@/lib/auth';
import { usePendingInvites, type PendingInvite } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import type { Household } from '@/lib/types';

type HouseholdContextValue = {
  householdId: string | null;
  household: Household | null;
  households: Household[];
  pendingInvites: PendingInvite[];
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

  useEffect(() => {
    if (!userId) {
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
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Re-check for invites (and any newly-joined households) whenever the app
  // returns to the foreground, so an invite that arrives while a user is already
  // signed in appears without a cold start.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && userId) {
        qc.invalidateQueries({ queryKey: ['pendingInvites', userId] });
        qc.invalidateQueries({ queryKey: ['households', userId] });
      }
    });
    return () => sub.remove();
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

  const { data: pendingInvites = [], isLoading: invitesLoading } = usePendingInvites(userId);

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

  // Not "ready" until both the household list and the invite list have loaded —
  // otherwise the "create your first household" state can flash for a user who
  // actually has a pending invite waiting.
  const isLoading = !!session && (householdsLoading || invitesLoading);

  const value = useMemo<HouseholdContextValue>(
    () => ({ householdId, household, households, pendingInvites, isLoading, setActiveHousehold }),
    [householdId, household, households, pendingInvites, isLoading, setActiveHousehold]
  );

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}
