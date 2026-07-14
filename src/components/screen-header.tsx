import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';

type Props = { eyebrow?: string; title: string; avatar?: string | null };

/** Shared top bar: eyebrow + title on the left, tappable profile avatar right. */
export function ScreenHeader({ eyebrow, title, avatar }: Props) {
  const router = useRouter();
  return (
    <View style={styles.row}>
      <View style={styles.titles}>
        {eyebrow && (
          <ThemedText type="label" themeColor="textSecondary">
            {eyebrow}
          </ThemedText>
        )}
        <ThemedText type="title">{title}</ThemedText>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open profile"
        onPress={() => router.push('/profile')}
        style={styles.avatar}>
        <ThemedText type="subtitle" style={styles.avatarGlyph}>
          {avatar || '🙂'}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    gap: Spacing.three,
  },
  titles: {
    flex: 1,
    gap: 2,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: Radius.pill,
    backgroundColor: Palette.sage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarGlyph: {
    color: Palette.card,
  },
});
