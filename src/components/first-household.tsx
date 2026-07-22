import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { CreateHouseholdSheet } from '@/components/create-household-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette, Radius, Spacing } from '@/constants/theme';

/**
 * Empty state for an account with a profile but no households yet. Identity
 * (name/avatar) is already set at the account level, so this only names the
 * household and optionally invites people.
 */
export function FirstHousehold() {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <View style={styles.body}>
          <View style={styles.badge}>
            <ThemedText type="display">🏡</ThemedText>
          </View>
          <ThemedText type="title" style={styles.heading}>
            Let&apos;s set up your household
          </ThemedText>
          <ThemedText type="body" themeColor="textSecondary" style={styles.sub}>
            A household is where your income, bills, goals and weekly spending
            live. You can invite others — or keep it just for you.
          </ThemedText>
          <Button title="Create your household" onPress={() => setSheetOpen(true)} style={styles.cta} />
        </View>
      </SafeAreaView>

      <CreateHouseholdSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.five,
    gap: Spacing.three,
  },
  badge: {
    width: 96,
    height: 96,
    borderRadius: Radius.pill,
    backgroundColor: Palette.sage,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  heading: { textAlign: 'center' },
  sub: { textAlign: 'center' },
  cta: { alignSelf: 'stretch', marginTop: Spacing.three },
});
