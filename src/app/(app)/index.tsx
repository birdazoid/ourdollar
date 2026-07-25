import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { RetryScreen } from '@/components/retry-screen';
import { ThemedView } from '@/components/themed-view';
import { Palette } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { useHousehold } from '@/lib/household';
import { useAccount, useBills, useIncome } from '@/lib/queries';

// Entry point once authed with a household. Sends a brand-new account through
// the onboarding wizard (Phase 4) on first login; everyone else lands on Week.
export default function AppIndex() {
  const { session } = useSession();
  const { householdId } = useHousehold();
  const account = useAccount(session?.user.id ?? null);
  const income = useIncome(householdId);
  const bills = useBills(householdId);

  if (account.isLoading || income.isLoading || bills.isLoading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={Palette.sageDeep} />
      </ThemedView>
    );
  }

  if (account.isError || income.isError || bills.isError) {
    return (
      <RetryScreen
        onRetry={() => {
          account.refetch();
          income.refetch();
          bills.refetch();
        }}
      />
    );
  }

  // Auto-launch only for an un-onboarded account whose household is still
  // empty — so invited users joining a populated household (and returning
  // users) skip straight to the app.
  const needsOnboarding =
    !!account.data &&
    !account.data.onboarded &&
    (income.data?.length ?? 0) === 0 &&
    (bills.data?.length ?? 0) === 0;

  return <Redirect href={needsOnboarding ? '/onboarding' : '/week'} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
