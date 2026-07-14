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
};

type Props = {
  state: ConfirmState | null;
  onClose: () => void;
};

/** Destructive-action confirmation (design-brief §2: confirm before delete). */
export function ConfirmDialog({ state, onClose }: Props) {
  return (
    <Sheet visible={!!state} title={state?.title} onClose={onClose}>
      {state?.message && (
        <ThemedText type="body" themeColor="textSecondary" style={styles.message}>
          {state.message}
        </ThemedText>
      )}
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
            style={styles.danger}
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  message: { marginBottom: Spacing.two },
  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three },
  flex: { flex: 1 },
  danger: { backgroundColor: Palette.terracottaDeep, borderRadius: Radius.large },
});
