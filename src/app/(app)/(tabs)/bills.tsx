import { StyleSheet } from 'react-native';

import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

export default function BillsScreen() {
  return (
    <Screen>
      <ScreenHeader eyebrow="July 2026" title="Bills" />
      <Card style={styles.placeholder}>
        <ThemedText type="body" themeColor="textSecondary">
          Bills and savings goals land here soon.
        </ThemedText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    marginTop: Spacing.three,
    alignItems: 'center',
    paddingVertical: Spacing.five,
  },
});
