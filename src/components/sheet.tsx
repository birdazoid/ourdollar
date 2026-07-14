import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';

type Props = {
  visible: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
};

/** Bottom sheet modal: dimmed backdrop, rounded top, tap-outside to close. */
export function Sheet({ visible, title, onClose, children }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.fill}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.four }]}>
          <View style={styles.grabber} />
          {title && (
            <ThemedText type="subtitle" style={styles.title}>
              {title}
            </ThemedText>
          )}
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(61,64,91,0.4)',
  },
  sheet: {
    backgroundColor: Palette.linen,
    borderTopLeftRadius: Radius.large + 8,
    borderTopRightRadius: Radius.large + 8,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(61,64,91,0.18)',
    marginBottom: Spacing.three,
  },
  title: {
    marginBottom: Spacing.three,
  },
});
