import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { subscribeToToasts, type ToastMessage } from '@/lib/toast';

const VISIBLE_MS = 6000;

/**
 * Renders the most recent transient message, mounted once at the root.
 *
 * Anchored to the TOP: the tab bar floats over the bottom of every screen, and
 * a message about a lost expense is worth more than the tab bar is.
 *
 * One at a time, newest wins. A burst of failures is one underlying problem,
 * and stacking five copies of "check your connection" helps nobody.
 */
export function ToastHost() {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastMessage | null>(null);
  // useState rather than a ref: the JSX below reads this during render, and
  // reading `.current` at render time makes the React Compiler bail out of
  // optimising the component. A lazy initialiser is just as stable.
  const [slide] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => subscribeToToasts(setToast), []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!toast) return;

    Animated.spring(slide, { toValue: 1, useNativeDriver: true, bounciness: 4 }).start();
    timer.current = setTimeout(() => {
      Animated.timing(slide, { toValue: 0, duration: 180, useNativeDriver: true }).start(() =>
        setToast(null)
      );
    }, VISIBLE_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [toast, slide]);

  if (!toast) return null;

  const isError = toast.kind === 'error';
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        { top: insets.top + Spacing.two },
        {
          opacity: slide,
          transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
        },
      ]}>
      <Pressable
        accessibilityRole="alert"
        accessibilityLabel={toast.text}
        onPress={() => setToast(null)}
        style={[styles.toast, isError ? styles.error : styles.info]}>
        <ThemedText type="body" style={styles.text}>
          {toast.text}
        </ThemedText>
        <ThemedText type="small" style={styles.dismiss}>
          Tap to dismiss
        </ThemedText>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: Spacing.three, right: Spacing.three, zIndex: 100 },
  toast: {
    borderRadius: Radius.large,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    gap: 2,
  },
  error: { backgroundColor: Palette.terracottaDeep },
  info: { backgroundColor: Palette.sageDeep },
  text: { color: Palette.card },
  dismiss: { color: 'rgba(255,255,255,0.75)' },
});
