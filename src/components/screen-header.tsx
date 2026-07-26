import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { useHousehold } from '@/lib/household';
import { householdColor } from '@/lib/household-color';
import { useMembers } from '@/lib/queries';

type Props = { eyebrow?: string; title: string; avatar?: string | null };

/** Shared top bar: eyebrow + title on the left, tappable profile avatar right.
 *  The avatar defaults to the current member's chosen avatar (matches setup).
 *  With more than one household, a color-coded household pill sits on top so the
 *  active household is always visible and switching is obvious. */
export function ScreenHeader({ eyebrow, title, avatar }: Props) {
  const router = useRouter();
  const { session } = useSession();
  const { householdId, household, households } = useHousehold();
  const members = useMembers(householdId);
  const me = (members.data ?? []).find((m) => m.account_id === session?.user.id);
  const shownAvatar = avatar ?? me?.avatar ?? '🙂';
  const multi = households.length > 1;
  const color = household ? householdColor(household) : null;
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
      {multi && household && color && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Household: ${household.name}. Switch household`}
          onPress={() => router.push('/profile')}
          style={styles.hhPill}>
          <View style={[styles.hhDot, { backgroundColor: color.dot }]} />
          <ThemedText type="small" style={styles.hhName} numberOfLines={1}>
            {household.name}
          </ThemedText>
        </Pressable>
      )}
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
  hhPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    maxWidth: 150,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.two + 2,
  },
  hhDot: { width: 9, height: 9, borderRadius: Radius.pill },
  hhName: { flexShrink: 1, fontWeight: '500' },
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
