import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

type Props = { title: string; icon?: ReactNode; action?: string };

/** "Monthly income        the foundation" — section label with optional icon and hint. */
export function SectionHeader({ title, icon, action }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.titleRow}>
        {icon}
        <ThemedText type="subtitle">{title}</ThemedText>
      </View>
      {action && (
        <ThemedText type="small" themeColor="textSecondary">
          {action}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: Spacing.four,
    marginBottom: Spacing.three,
    gap: Spacing.two,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
});
