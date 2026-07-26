import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
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
  outline?: boolean; // terracotta outline (overdue)
  dim?: boolean; // muted/paid state
  strikethrough?: boolean; // line through the title (done/paid state)
};

/** The shared rounded-tile list row used by bills, goals, income, expenses. */
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
}: Props) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.wrap}>
      <Card style={[styles.card, outline && styles.outline, dim && styles.dim]}>
        <View style={styles.topRow}>
          <View style={styles.tile}>
            {typeof emoji === 'string' ? <ThemedText type="subtitle">{emoji}</ThemedText> : emoji}
          </View>
          <View style={styles.body}>
            <ThemedText
              type="bodyBold"
              numberOfLines={1}
              style={strikethrough && styles.strikethrough}>
              {title}
            </ThemedText>
            {subtitle && (
              <View style={styles.subRow}>
                <ThemedText type="small" style={subColor ? { color: subColor } : undefined} themeColor={subColor ? undefined : 'textSecondary'} numberOfLines={1}>
                  {subtitle}
                </ThemedText>
                {badge}
              </View>
            )}
          </View>
          {right}
        </View>
        {footer}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: Spacing.two + 2 },
  card: {},
  topRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  tile: {
    width: 44,
    height: 44,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  outline: { borderWidth: 1.5, borderColor: Palette.terracotta },
  dim: { opacity: 0.6 },
  strikethrough: { textDecorationLine: 'line-through' },
});
