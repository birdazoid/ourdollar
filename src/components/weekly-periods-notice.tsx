import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Sheet } from '@/components/sheet';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { useHousehold } from '@/lib/household';
import { NOTICE_WEEKLY_PERIODS, useOneTimeNotice } from '@/lib/notices';

/**
 * When the weekly amount started being split by the real week count. Only
 * households created before this ever saw the old figure, so only they get the
 * notice. Compared against households.created_at, which is an ISO timestamp.
 */
const WEEKLY_PERIODS_RELEASED_AT = '2026-08-01T00:00:00Z';

/** The detail behind "Why this matters", shared with the Setup screen's ⓘ. */
export const WEEKLY_PERIODS_INFO = {
  title: 'How your weekly amount works',
  paragraphs: [
    'Your month’s spending money is whatever’s left after bills, savings goals, and fun money.',
    'That amount is split evenly across the weeks in the month. Some months have 4 weeks, some have 5, so your weekly amount changes a little month to month.',
    'Weeks never split across months. A week that starts in one month stays with that month, so your amount never changes partway through a week.',
  ],
};

/**
 * Shown once per account, the first time the app opens after the weekly
 * amount started being split by the real number of weeks.
 *
 * A number the household budgets against got smaller. Letting them discover
 * that on their own invites the conclusion that something is broken, which is
 * the kind of confusion people quit over, so this is the one place worth
 * interrupting for.
 */
export function WeeklyPeriodsNotice() {
  const { session } = useSession();
  const { household } = useHousehold();
  const { show, dismiss } = useOneTimeNotice(session?.user.id ?? null, NOTICE_WEEKLY_PERIODS);
  const [detail, setDetail] = useState(false);

  // Nothing changed for a household that started on the new math, and telling
  // someone their amount "changed" on day one is the exact confusion this is
  // meant to prevent.
  const predatesChange = household ? household.created_at < WEEKLY_PERIODS_RELEASED_AT : false;

  if (!show || !predatesChange) return null;

  return (
    <Sheet
      visible
      title={detail ? WEEKLY_PERIODS_INFO.title : 'Your weekly amount changed'}
      onClose={dismiss}>
      {detail ? (
        WEEKLY_PERIODS_INFO.paragraphs.map((p, i) => (
          <ThemedText key={i} type="body" themeColor="textSecondary" style={styles.para}>
            {p}
          </ThemedText>
        ))
      ) : (
        <ThemedText type="body" themeColor="textSecondary" style={styles.para}>
          Not every month has 4 weeks. Splitting each month 4 ways left the 5th week unfunded. Your
          money now splits by the real number of weeks, so it lasts the whole month.
        </ThemedText>
      )}
      <View style={styles.actions}>
        {!detail && (
          <View style={styles.flex}>
            <Button title="Why this matters" variant="secondary" onPress={() => setDetail(true)} />
          </View>
        )}
        <View style={styles.flex}>
          <Button title="Got it" onPress={dismiss} />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  para: { marginBottom: Spacing.two },
  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  flex: { flex: 1 },
});
