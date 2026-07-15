import type { ReactNode, RefObject } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill} edges={['top']}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    paddingHorizontal: Spacing.four,
    paddingBottom: 140, // clears the floating nav
  },
});
