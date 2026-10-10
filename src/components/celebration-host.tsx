import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  ZoomIn,
  type SharedValue,
} from 'react-native-reanimated';

import IconCelebrate from '@/assets/icons/icon-celebrate.svg';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { subscribeToCelebrations, type Celebration } from '@/lib/celebrate';
import { haptic } from '@/lib/haptics';

const VISIBLE_MS = 3600;
const BURST_MS = 1700;
const COLOURS = [
  Palette.sage,
  Palette.sand,
  Palette.terracotta,
  Palette.sageDeep,
  Palette.sandDeep,
];

// A fixed scatter rather than Math.random, so the burst looks the same every
// time and renders the same on every device.
const PIECES = Array.from({ length: 22 }, (_, i) => {
  const angle = (i / 22) * Math.PI * 2 + (i % 3) * 0.21;
  const speed = 110 + ((i * 37) % 70);
  return {
    dx: Math.cos(angle) * speed,
    dy: Math.sin(angle) * speed * 0.8 - 40,
    spin: ((i * 53) % 360) - 180,
    colour: COLOURS[i % COLOURS.length],
    w: i % 2 ? 7 : 10,
    h: i % 2 ? 12 : 6,
  };
});

/**
 * Draws a celebration (see lib/celebrate.ts) over the app: a card with a short
 * confetti burst behind it and one success haptic. Mounted once at the root,
 * next to ToastHost. Tap to dismiss; it also leaves on its own.
 *
 * Under Reduce Motion the card simply appears and there's no confetti.
 */
export function CelebrationHost() {
  const [current, setCurrent] = useState<Celebration | null>(null);
  const reduceMotion = useReduceMotion();
  const burst = useSharedValue(0);

  useEffect(
    () =>
      subscribeToCelebrations((c) => {
        setCurrent(c);
        haptic.success();
        AccessibilityInfo.announceForAccessibility(`${c.title}. ${c.text}`);
      }),
    [],
  );

  useEffect(() => {
    if (!current) return;
    burst.value = 0;
    burst.value = withTiming(1, { duration: BURST_MS, easing: Easing.out(Easing.quad) });
    const timer = setTimeout(() => setCurrent(null), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [current, burst]);

  if (!current) return null;

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      {!reduceMotion && (
        <View pointerEvents="none" style={styles.origin}>
          {PIECES.map((p, i) => (
            <Piece key={`${current.id}-${i}`} piece={p} burst={burst} />
          ))}
        </View>
      )}
      <Animated.View
        key={current.id}
        entering={ZoomIn.springify().damping(14).stiffness(200)}
        exiting={FadeOut.duration(200)}
      >
        <Pressable
          accessibilityRole="alert"
          accessibilityLabel={`${current.title}. ${current.text} Tap to dismiss.`}
          onPress={() => setCurrent(null)}
          style={styles.card}
        >
          <View style={styles.badge}>
            <IconCelebrate width={30} height={30} color={Palette.ink} />
          </View>
          <ThemedText type="subtitle" style={styles.title}>
            {current.title}
          </ThemedText>
          <ThemedText type="body" themeColor="textSecondary" style={styles.text}>
            {current.text}
          </ThemedText>
        </Pressable>
      </Animated.View>
    </View>
  );
}

function Piece({ piece, burst }: { piece: (typeof PIECES)[number]; burst: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const p = burst.value;
    return {
      opacity: p < 0.75 ? 1 : 1 - (p - 0.75) / 0.25,
      transform: [
        { translateX: piece.dx * p },
        // Out fast, then gravity takes over.
        { translateY: piece.dy * p + 160 * p * p },
        { rotate: `${piece.spin * p * 3}deg` },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        styles.piece,
        { width: piece.w, height: piece.h, backgroundColor: piece.colour },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.five,
    zIndex: 90,
  },
  origin: { position: 'absolute', top: '50%', left: '50%' },
  piece: { position: 'absolute', borderRadius: 2 },
  card: {
    backgroundColor: Palette.card,
    borderRadius: Radius.large,
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    gap: Spacing.one,
    maxWidth: 340,
    shadowColor: Palette.ink,
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(242,204,143,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  title: { textAlign: 'center' },
  text: { textAlign: 'center' },
});
