import { X } from 'lucide-react-native';
import { useEffect, useRef, type ReactNode } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';

type Props = {
  visible: boolean;
  title?: string;
  /** Optional glyph shown before the title, so headers use icons rather than emoji. */
  titleIcon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
};

/**
 * Bottom sheet modal. The backdrop fades in (doesn't slide) while only the panel
 * slides up. Header (grabber + title + close) stays fixed; the body scrolls, so
 * with the keyboard up you can still reach every field and the action button,
 * and there's always a visible ✕ to close.
 */
export function Sheet({ visible, title, titleIcon, onClose, children }: Props) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    if (visible) {
      translateY.setValue(40);
      Animated.timing(translateY, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, translateY]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.fill}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + Spacing.three, transform: [{ translateY }] },
          ]}>
          <View style={styles.grabber} />
          <View style={styles.headerRow}>
            {title ? (
              <View style={styles.title}>
                {titleIcon}
                <ThemedText type="subtitle" style={styles.titleText}>
                  {title}
                </ThemedText>
              </View>
            ) : (
              <View style={styles.title} />
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              hitSlop={8}
              style={styles.closeBtn}>
              <X size={18} color={Palette.ink} />
            </Pressable>
          </View>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </Animated.View>
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
    maxHeight: '92%',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(61,64,91,0.18)',
    marginBottom: Spacing.two,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.three,
  },
  title: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  titleText: { flexShrink: 1 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.pill,
    backgroundColor: Palette.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingBottom: Spacing.two },
});
