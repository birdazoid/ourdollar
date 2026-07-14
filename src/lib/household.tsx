import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';

import { useSession } from '@/lib/auth';
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

// RLS already scopes households to the current user (owned or member-of), so a
// plain select returns exactly the ones they can see.
export function HouseholdProvider({ children }: PropsWithChildren) {
  const { session } = useSession();
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data: households = [], isLoading } = useQuery({
    queryKey: ['households', session?.user.id],
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

  const householdId = activeId ?? households[0]?.id ?? null;
  const household = households.find((h) => h.id === householdId) ?? null;

  const value = useMemo<HouseholdContextValue>(
    () => ({
      householdId,
      household,
      households,
      isLoading,
      setActiveHousehold: setActiveId,
    }),
    [householdId, household, households, isLoading]
  );

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}
