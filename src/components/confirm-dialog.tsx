import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Sheet } from '@/components/sheet';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';

export type ConfirmState = {
  title: string;
  message?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  /** 'danger' (default) for deleting or dismissing; 'primary' for a plain yes. */
  tone?: 'danger' | 'primary';
  /** A second real choice besides Cancel, e.g. "which month was this for?". */
  secondary?: { label: string; onPress: () => void };
};

type Props = {
  state: ConfirmState | null;
  onClose: () => void;
};

/**
 * Confirmation before an action that's easy to hit by mistake (design-brief §2:
 * confirm before delete). Also used for a two-way choice via `secondary`.
 */
export function ConfirmDialog({ state, onClose }: Props) {
  return (
    <Sheet visible={!!state} title={state?.title} onClose={onClose}>
      {state?.message && (
        <ThemedText type="body" themeColor="textSecondary" style={styles.message}>
          {state.message}
        </ThemedText>
      )}
      {state?.secondary ? (
        // Two real choices: stacked full width so neither label gets cut off.
        <View style={styles.stack}>
          <Button
            title={state.confirmLabel ?? 'Delete'}
            onPress={() => {
              state.onConfirm();
              onClose();
            }}
            style={state.tone === 'primary' ? undefined : styles.danger}
          />
          <Button
            title={state.secondary.label}
            variant="secondary"
            // Close first: the choice may open a follow-up confirmation, which
            // closing afterwards would wipe.
            onPress={() => {
              const next = state.secondary?.onPress;
              onClose();
              next?.();
            }}
          />
          <Button title="Cancel" variant="secondary" onPress={onClose} />
        </View>
      ) : (
        <View style={styles.actions}>
          <View style={styles.flex}>
            <Button title="Cancel" variant="secondary" onPress={onClose} />
          </View>
          <View style={styles.flex}>
            <Button
              title={state?.confirmLabel ?? 'Delete'}
              onPress={() => {
                state?.onConfirm();
                onClose();
              }}
              style={state?.tone === 'primary' ? undefined : styles.danger}
            />
          </View>
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  message: { marginBottom: Spacing.two },
  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three },
  stack: { gap: Spacing.two, marginTop: Spacing.three },
  flex: { flex: 1 },
  danger: { backgroundColor: Palette.terracottaDeep, borderRadius: Radius.large },
});
