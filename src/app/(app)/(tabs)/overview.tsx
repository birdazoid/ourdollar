import { StyleSheet } from 'react-native';

import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

export default function OverviewScreen() {
  return (
    <Screen>
      <ScreenHeader eyebrow="July 2026" title="Overview" />
      <Card style={styles.placeholder}>
        <ThemedText type="body" themeColor="textSecondary">
          Monthly math and trends land here soon.
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
