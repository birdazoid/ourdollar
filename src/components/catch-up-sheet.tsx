import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { FieldLabel } from '@/components/inputs';
import { Sheet } from '@/components/sheet';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { fmt } from '@/lib/money';
import type { CatchUpEntry } from '@/lib/types';

type Props = {
  visible: boolean;
  balance: number;
  entries: CatchUpEntry[];
  memberName: (id: string | null) => string | null;
  onClose: () => void;
};

const KIND_LABEL: Record<CatchUpEntry['kind'], string> = {
  week_overage: 'Went over',
  payment: 'Made up',
  adjustment: 'Adjusted',
};

/**
 * The catch-up balance in full: what's outstanding, how it got there, and how
 * it comes down.
 *
 * The history is the point. A single number labelled "you're $563 behind"
 * invites exactly the question the app couldn't answer before, so every
 * movement is listed with the week it came from or where the money came from.
 */
export function CatchUpSheet({ visible, balance, entries, memberName, onClose }: Props) {
  return (
    <Sheet visible={visible} title="Catch-up" onClose={onClose}>
      <Card style={styles.headline}>
        <ThemedText type="small" themeColor="textSecondary">
          {balance > 0 ? 'Still to make up' : 'All caught up'}
        </ThemedText>
        <ThemedText type="display" style={balance > 0 ? styles.owed : styles.clear}>
          {fmt(balance)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.blurb}>
          {balance > 0
            ? "You've already spent this. Nobody is owed it — it's a record of how far past your plan you went, so it isn't quietly forgotten. It never comes out of your weekly money."
            : "Nothing outstanding. Weeks that go over can be sent here instead of eating into the next week."}
        </ThemedText>
      </Card>

      {/* No "pay some off" button any more. It was the only route that let the
          balance drop with no real money behind it. Every legitimate use of it
          is better served by logging the money as income and assigning it here,
          which records where the money came from as well as where it went. */}
      <View style={styles.howBox}>
        <ThemedText type="bodyBold" style={styles.howTitle}>
          How this comes down
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.howBody}>
          Two ways, and both come from real money. Finish a week under budget and you can put
          the leftover toward it. Or log money coming in, from selling something or a bonus,
          and choose &quot;Toward catch-up&quot; instead of adding it to your week.
        </ThemedText>
      </View>

      <FieldLabel>History</FieldLabel>
      {entries.length === 0 ? (
        <ThemedText type="body" themeColor="textSecondary" style={styles.empty}>
          Nothing here yet.
        </ThemedText>
      ) : (
        entries.map((e) => {
          const adds = Number(e.amount) > 0;
          const who = memberName(e.created_by_member_id);
          return (
            <View key={e.id} style={styles.entry}>
              <View style={styles.flex}>
                <ThemedText type="bodyBold">{KIND_LABEL[e.kind]}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {[e.note, who].filter(Boolean).join(' · ')}
                </ThemedText>
              </View>
              <ThemedText type="bodyBold" style={adds ? styles.owed : styles.clear}>
                {adds ? '+' : '-'}
                {fmt(Math.abs(Number(e.amount)))}
              </ThemedText>
            </View>
          );
        })
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headline: { alignItems: 'center', gap: 2, marginBottom: Spacing.three },
  blurb: { textAlign: 'center', marginTop: Spacing.two, lineHeight: 19 },
  owed: { color: Palette.terracottaDeep },
  clear: { color: Palette.sageDeep },
  howBox: {
    backgroundColor: 'rgba(129,178,154,0.14)',
    borderRadius: Radius.large,
    padding: Spacing.three,
    marginBottom: Spacing.three,
    gap: 2,
  },
  howTitle: { color: Palette.sageDeep },
  howBody: { lineHeight: 19 },
  empty: { paddingVertical: Spacing.three },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.card,
    borderRadius: Radius.large,
    padding: Spacing.three,
    marginBottom: Spacing.two,
  },
});
