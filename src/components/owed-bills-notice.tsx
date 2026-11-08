import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useHousehold } from '@/lib/household';
import { fmt } from '@/lib/money';
import { monthName } from '@/lib/month-review';
import { useBillCarryovers } from '@/lib/queries';

/**
 * Bills a closed month left unpaid, surfaced on the Week screen.
 *
 * They used to live only at the top of the Bills tab. When a month closes,
 * each bill also resets to this month's copy, so a household that never
 * opened Bills saw October's OG&E simply turn into November's, with no sign
 * that October's was still owed. Tapping goes to Bills, where each one is
 * settled.
 *
 * Shown only while there's something owed; absent otherwise. It doesn't touch
 * the weekly figure: the month that left the bill unpaid already set its money
 * aside, so that money is still in the account, not part of this month's plan.
 */
export function OwedBillsNotice() {
  const router = useRouter();
  const { householdId } = useHousehold();
  const carryovers = useBillCarryovers(householdId);
  const owed = carryovers.data ?? [];

  if (owed.length === 0) return null;

  const total = owed.reduce((a, c) => a + (c.amount ?? 0), 0);
  const months = [...new Set(owed.map((c) => monthName(c.from_month)))];
  const fromWhen = months.length === 1 ? months[0] : 'past months';
  const what = owed.length === 1 ? `${owed[0].name} from ${fromWhen} is` : `${owed.length} bills from ${fromWhen} are`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${what} still unpaid. Open Bills to settle them.`}
      onPress={() => router.push('/bills')}
      style={styles.banner}>
      <View style={styles.flex}>
        <ThemedText type="bodyBold" style={styles.text}>
          {what} still unpaid
        </ThemedText>
        <ThemedText type="small" style={styles.subText}>
          {total > 0 ? `${fmt(total)} owed · ` : ''}tap to see them on Bills
        </ThemedText>
      </View>
      <ChevronRight size={18} color={Palette.terracottaDeep} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: 'rgba(224,122,95,0.12)',
    borderRadius: Radius.large,
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  text: { color: Palette.terracottaDeep },
  subText: { color: 'rgba(194,90,64,0.85)' },
});
