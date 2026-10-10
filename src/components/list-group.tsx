import { createContext, useContext, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { cardShadow } from '@/components/card';
import { Palette, Radius, Spacing } from '@/constants/theme';

const InGroup = createContext(false);

/** Whether a row is being drawn inside a ListGroup (and so draws no card of its own). */
export const useInListGroup = () => useContext(InGroup);

/**
 * One card holding a section's rows, separated by hairlines, like a grouped
 * list in iOS Settings or Wallet.
 *
 * Replaces a card per row. A ten-bill list took two full screens as separate
 * cards; grouped, it's half that and reads as one list. Rows (ListRow) notice
 * they're inside a group and drop their own card. Each row draws the line
 * above itself; the first row's line is tucked under the group's top edge,
 * so rows can be added, removed or animated without anything tracking which
 * one is first.
 */
export function ListGroup({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.shadow, style]}>
      <View style={styles.clip}>
        <View style={styles.inner}>
          <InGroup.Provider value={true}>{children}</InGroup.Provider>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Shadow and clipping on separate views: iOS drops the shadow of a view
  // that clips its own content.
  shadow: {
    backgroundColor: Palette.card,
    borderRadius: Radius.large,
    marginBottom: Spacing.three,
    ...cardShadow,
  },
  clip: { borderRadius: Radius.large, overflow: 'hidden' },
  inner: { marginTop: -StyleSheet.hairlineWidth },
});
