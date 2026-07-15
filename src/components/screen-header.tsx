import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { useHousehold } from '@/lib/household';
import { useMembers } from '@/lib/queries';

type Props = { eyebrow?: string; title: string; avatar?: string | null };

/** Shared top bar: eyebrow + title on the left, tappable profile avatar right.
 *  The avatar defaults to the current member's chosen avatar (matches setup). */
export function ScreenHeader({ eyebrow, title, avatar }: Props) {
  const router = useRouter();
  const { session } = useSession();
  const { householdId } = useHousehold();
  const members = useMembers(householdId);
  const me = (members.data ?? []).find((m) => m.account_id === session?.user.id);
  const shownAvatar = avatar ?? me?.avatar ?? '🙂';
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
          {shownAvatar}
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
    // No horizontal padding: the parent Screen already insets content, so the
    // heading lines up with the cards below it.
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
