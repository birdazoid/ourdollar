import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

type Props = {
  title: string;
  icon?: ReactNode;
  action?: string;
  /** A sentence under the title, for a section whose rule isn't self-evident. */
  caption?: string;
};

/** "Monthly income        the foundation" — section label with optional icon and hint. */
export function SectionHeader({ title, icon, action, caption }: Props) {
  return (
    <View>
      <View style={[styles.row, caption ? styles.rowTight : null]}>
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
      {caption && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.caption}>
          {caption}
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
  rowTight: { marginBottom: Spacing.one },
  caption: { marginBottom: Spacing.three, lineHeight: 18 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
});
