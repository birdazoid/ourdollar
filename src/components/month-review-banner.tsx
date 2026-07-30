import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useHousehold } from '@/lib/household';
import { monthLabel, pendingReviewMonth } from '@/lib/month-review';
import { useMonthSnapshots } from '@/lib/queries';

const dismissKey = (householdId: string) => `ourdollar.dismissedMonthReview.${householdId}`;

/**
 * Dismissible, non-blocking nudge to review a month that's wrapped up — never a
 * modal, never gates anything. Ignoring it costs nothing; Week/add-expense are
 * completely unaffected either way. Dismissal is remembered per household+month,
 * so it clears itself once the NEXT month rolls around.
 */
export function MonthReviewBanner() {
  const router = useRouter();
  const { householdId, household } = useHousehold();
  const snapshots = useMonthSnapshots(householdId);
  const [dismissedMonth, setDismissedMonth] = useState<string | null>(null);

  useEffect(() => {
    if (!householdId) return;
    AsyncStorage.getItem(dismissKey(householdId))
      .then(setDismissedMonth)
      .catch(() => {});
  }, [householdId]);

  if (!household || snapshots.isLoading) return null;
  const reviewedMonths = (snapshots.data ?? []).map((s) => s.month);
  const pending = pendingReviewMonth(household.created_at, reviewedMonths);
  if (!pending || pending === dismissedMonth) return null;

  function dismiss() {
    if (householdId) AsyncStorage.setItem(dismissKey(householdId), pending!).catch(() => {});
    setDismissedMonth(pending);
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${monthLabel(pending)} wrapped up — review and start the new month`}
      onPress={() => router.push('/month-review')}
      style={styles.banner}>
      <View style={styles.flex}>
        <ThemedText type="bodyBold" style={styles.text}>
          {monthLabel(pending)} wrapped up
        </ThemedText>
        <ThemedText type="small" style={styles.subText}>
          Review & start the new month
        </ThemedText>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={dismiss} hitSlop={8} style={styles.dismissBtn}>
        <X size={16} color={Palette.sageDeep} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: 'rgba(129,178,154,0.16)',
    borderRadius: Radius.large,
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  text: { color: Palette.sageDeep },
  subText: { color: 'rgba(94,143,119,0.85)' },
  dismissBtn: {
    width: 30,
    height: 30,
    borderRadius: Radius.pill,
    backgroundColor: Palette.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
