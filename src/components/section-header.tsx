import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

type Props = { title: string; action?: string };

/** "Monthly income        the foundation" — section label with optional hint. */
export function SectionHeader({ title, action }: Props) {
  return (
    <View style={styles.row}>
      <ThemedText type="subtitle">{title}</ThemedText>
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
});
