import type { ReactNode, RefObject } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

type Props = {
  children: ReactNode;
  /** Optional handle to the inner ScrollView (e.g. to scroll to a row). */
  scrollRef?: RefObject<ScrollView | null>;
};

/** Screen scaffold: linen background, safe-area top, scrollable body that
 *  clears the floating tab bar at the bottom. */
export function Screen({ children, scrollRef }: Props) {
  // The tab bar floats above the home indicator, so the space to clear grows
  // with it. A fixed amount left the last row under the bar on some phones.
  const insets = useSafeAreaInsets();
  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill} edges={['top']}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.content, { paddingBottom: TAB_BAR_CLEARANCE + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

// Tab bar height plus the + button's overhang and a little breathing room.
const TAB_BAR_CLEARANCE = 130;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    paddingHorizontal: Spacing.four,
  },
});
