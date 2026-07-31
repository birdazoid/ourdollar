import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AvatarGlyph } from '@/components/avatar-glyph';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { useHousehold } from '@/lib/household';
import { useMembers } from '@/lib/queries';

type Props = { eyebrow?: string; title: string; avatar?: string | null };

/** Shared top bar: eyebrow + title on the left, a single tappable pill on the
 *  right combining the household name and the current member's avatar — one
 *  target that opens the profile screen (which is also where you switch
 *  households when there's more than one). */
export function ScreenHeader({ eyebrow, title, avatar }: Props) {
  const router = useRouter();
  const { session } = useSession();
  const { householdId, household } = useHousehold();
  const members = useMembers(householdId);
  const me = (members.data ?? []).find((m) => m.account_id === session?.user.id);
  const shownAvatar = avatar ?? me?.avatar;
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
      {household && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Household: ${household.name}. Open profile`}
          onPress={() => router.push('/profile')}
          style={styles.hhPill}>
          <ThemedText type="small" style={styles.hhName} numberOfLines={1}>
            {household.name}
          </ThemedText>
          <AvatarGlyph value={shownAvatar} size={38} />
        </Pressable>
      )}
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
    gap: Spacing.two,
    maxWidth: 190,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(61,64,91,0.25)',
    paddingVertical: Spacing.one,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.one,
  },
  hhName: { flexShrink: 1, fontWeight: '500' },
});
