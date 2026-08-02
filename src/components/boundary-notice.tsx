import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { InfoSheet, InfoTap } from '@/components/info-sheet';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { monthLabel } from '@/lib/month-review';
import { fundingMonthForWeek, isBoundaryWindow, monthOf, weekStartFor } from '@/lib/period';
import { todayISO } from '@/lib/week';

const BOUNDARY_INFO = {
  title: 'Why next month’s bills come early',
  paragraphs: [
    'Your budget month runs in whole weeks, so it doesn’t line up exactly with the calendar month.',
    'That means the first few days of a calendar month can still belong to the previous budget month. Your spending money for those days comes from the previous month, while the new month’s bills start leaving your account.',
    'Your budget is still correct. Just keep an eye on your balance if bills are due before payday.',
  ],
};

const justMonth = (monthStart: string) => monthLabel(monthStart).split(' ')[0];

/**
 * Shown only during the few days where the calendar month has rolled over but
 * the budget period hasn't, so the new month's bills are leaving the account
 * while this week is still funded by the previous month.
 *
 * The budget is correct either way. This exists because the BANK BALANCE can
 * look tight in those days, and a household that doesn't know why will assume
 * the app is wrong. Never longer than 6 days (proven in verify:periods), and
 * absent the rest of the time.
 */
export function BoundaryNotice({ weekStartsOn }: { weekStartsOn: number }) {
  const [info, setInfo] = useState(false);
  const today = todayISO();

  if (!isBoundaryWindow(weekStartsOn, today)) return null;

  const calendarMonth = justMonth(monthOf(today));
  const fundingMonth = justMonth(fundingMonthForWeek(weekStartFor(today, weekStartsOn)));

  return (
    <>
      <View style={styles.banner}>
        <View style={styles.flex}>
          <ThemedText type="bodyBold" style={styles.text}>
            {calendarMonth}’s bills start this week
          </ThemedText>
          <ThemedText type="small" style={styles.subText}>
            This week is still funded by {fundingMonth}
          </ThemedText>
        </View>
        <InfoTap label="Why next month’s bills come early" onPress={() => setInfo(true)} />
      </View>
      <InfoSheet
        visible={info}
        title={BOUNDARY_INFO.title}
        paragraphs={BOUNDARY_INFO.paragraphs}
        onClose={() => setInfo(false)}
      />
    </>
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
