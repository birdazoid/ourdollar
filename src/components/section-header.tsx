import { Plus } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';

type Props = {
  title: string;
  icon?: ReactNode;
  action?: string;
  /** A sentence under the title, for a section whose rule isn't self-evident. */
  caption?: string;
  /**
   * Adds a "+ Add" button at the right of the heading. Every list's add action
   * lives here, in the same place on every screen: the old dashed "Add a …"
   * boxes looked like empty slots and sat wherever there was room, sometimes
   * a screen away from the list they added to.
   */
  onAdd?: () => void;
  /** What the add button adds, for screen readers ("Add a bill"). */
  addLabel?: string;
};

/** "Monthly income        + Add": section label with optional icon, hint and add button. */
export function SectionHeader({ title, icon, action, caption, onAdd, addLabel }: Props) {
  return (
    <View>
      <View style={[styles.row, caption ? styles.rowTight : null]}>
        <View style={styles.titleRow}>
          {icon}
          <ThemedText type="subtitle">{title}</ThemedText>
        </View>
        <View style={styles.right}>
          {action && (
            <ThemedText type="small" themeColor="textSecondary">
              {action}
            </ThemedText>
          )}
          {onAdd && (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={addLabel ?? `Add to ${title}`}
              hitSlop={8}
              scaleTo={0.94}
              onPress={onAdd}
              style={styles.add}>
              <Plus size={15} color={Palette.sageDeep} strokeWidth={3} />
              <ThemedText type="label" style={styles.addText}>
                Add
              </ThemedText>
            </PressableScale>
          )}
        </View>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.four,
    marginBottom: Spacing.three,
    gap: Spacing.two,
  },
  rowTight: { marginBottom: Spacing.one },
  caption: { marginBottom: Spacing.three, lineHeight: 22 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, flexShrink: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: Spacing.two + 2,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(129,178,154,0.18)',
  },
  addText: { color: Palette.sageDeep },
});
