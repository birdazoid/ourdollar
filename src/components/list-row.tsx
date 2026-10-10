import { ChevronRight } from 'lucide-react-native';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Card } from '@/components/card';
import { useInListGroup } from '@/components/list-group';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';

type Props = {
  emoji: ReactNode;
  title: string;
  subtitle?: string;
  subColor?: string;
  badge?: ReactNode; // small pill rendered after the subtitle (e.g. Fun money)
  right?: ReactNode;
  footer?: ReactNode;
  onPress?: () => void;
  /**
   * Needs attention (overdue). The icon sits on a soft terracotta tile, and on
   * its own the row's card also gets a terracotta outline. Inside a group it
   * used to be a red bar on the row's left edge, which the group's rounded
   * corners clipped on the first and last rows.
   */
  outline?: boolean;
  dim?: boolean; // muted/paid state
  strikethrough?: boolean; // line through the title (done/paid state)
  /**
   * Show the › that marks a row as tappable. On by default for any row with
   * onPress: some lists had it and some didn't, so people couldn't tell that
   * an expense opened when tapped. Turn off only where `right` already says
   * what a tap does.
   */
  chevron?: boolean;
};

const DIM_OPACITY = 0.6;

/**
 * The shared list row used by bills, goals, income and expenses.
 *
 * Inside a ListGroup it's a plain row with a hairline above it; on its own it
 * draws its own card, as every row used to.
 */
export function ListRow({
  emoji,
  title,
  subtitle,
  subColor,
  badge,
  right,
  footer,
  onPress,
  outline,
  dim,
  strikethrough,
  chevron = !!onPress,
}: Props) {
  const grouped = useInListGroup();

  // Settling into the muted "done" look (a bill just paid, an envelope
  // skipped) fades rather than snapping, so the change is seen as a change.
  const fade = useSharedValue(dim ? DIM_OPACITY : 1);
  useEffect(() => {
    fade.value = withTiming(dim ? DIM_OPACITY : 1, { duration: 320 });
  }, [dim, fade]);
  const faded = useAnimatedStyle(() => ({ opacity: fade.value }));

  const content = (
    <>
      <View style={styles.topRow}>
        <View style={[styles.tile, outline && styles.tileAttention]}>
          {typeof emoji === 'string' ? <ThemedText type="subtitle">{emoji}</ThemedText> : emoji}
        </View>
        <View style={styles.body}>
          <ThemedText type="bodyBold" numberOfLines={1} style={strikethrough && styles.strikethrough}>
            {title}
          </ThemedText>
          {subtitle && (
            <View style={styles.subRow}>
              {/* Two lines. This is descriptive text, not a name, and at one
                  line it was already cutting sentences off mid-word before
                  the type scale grew. */}
              <ThemedText
                type="small"
                style={subColor ? { color: subColor } : undefined}
                themeColor={subColor ? undefined : 'textSecondary'}
                numberOfLines={2}>
                {subtitle}
              </ThemedText>
              {badge}
            </View>
          )}
        </View>
        {right}
        {chevron && <ChevronRight size={16} color="#B7B8C4" />}
      </View>
      {footer}
    </>
  );

  return (
    <PressableScale
      scaleTo={grouped ? 0.99 : 0.98}
      onPress={onPress}
      disabled={!onPress}
      // Only announce as a button when it actually does something; a plain row
      // reporting itself as tappable is worse than saying nothing.
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? [title, subtitle].filter(Boolean).join(', ') : undefined}
      style={grouped ? styles.groupedWrap : styles.wrap}>
      <Animated.View style={faded}>
        {grouped ? (
          <View style={styles.groupedRow}>{content}</View>
        ) : (
          <Card style={outline && styles.outline}>{content}</Card>
        )}
      </Animated.View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: Spacing.two + 2 },
  groupedWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(61,64,91,0.14)',
  },
  groupedRow: { paddingVertical: Spacing.three - 2, paddingHorizontal: Spacing.three },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  tile: {
    width: 40,
    height: 40,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  body: { flex: 1, gap: 2 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  outline: { borderWidth: 1.5, borderColor: Palette.terracotta },
  tileAttention: { backgroundColor: 'rgba(224,122,95,0.16)' },
  strikethrough: { textDecorationLine: 'line-through' },
});
