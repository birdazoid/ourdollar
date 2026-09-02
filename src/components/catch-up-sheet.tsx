import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { FieldLabel, MoneyInput } from '@/components/inputs';
import { Sheet } from '@/components/sheet';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { fmt, sanitizeAmountInput } from '@/lib/money';
import type { CatchUpEntry } from '@/lib/types';

type Props = {
  visible: boolean;
  balance: number;
  entries: CatchUpEntry[];
  memberName: (id: string | null) => string | null;
  saving?: boolean;
  onPayFromWeek: (amount: number) => void;
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
export function CatchUpSheet({
  visible,
  balance,
  entries,
  memberName,
  saving,
  onPayFromWeek,
  onClose,
}: Props) {
  const [amount, setAmount] = useState('');
  const [paying, setPaying] = useState(false);

  // Reset on close during render rather than in an effect, which is the pattern
  // React documents for reacting to a prop change.
  const [wasVisible, setWasVisible] = useState(visible);
  if (wasVisible !== visible) {
    setWasVisible(visible);
    if (!visible) {
      setAmount('');
      setPaying(false);
    }
  }

  const amountNum = Number(amount);
  const wanted = Number.isFinite(amountNum) ? amountNum : 0;
  const capped = Math.min(wanted, balance);

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
            ? // "It never comes out of your weekly money" used to end this
              // paragraph. It's still true of what the app does on its own,
              // but it stopped being the whole truth the moment paying from a
              // week became a button, and a promise that quietly isn't kept is
              // worse than one never made.
              "You've already spent this. Nobody is owed it, it's a record of how far past your plan you went, so it isn't quietly forgotten. Nothing takes it out of your weekly money unless you choose to below."
            : 'Nothing outstanding. Weeks that go over can be sent here instead of eating into the next week.'}
        </ThemedText>
      </Card>

      {/*
        There was no "pay some off" button here for a while, and for a good
        reason: the old one dropped the balance with nothing behind it. This
        one charges the week, which is the same real money as finishing a week
        under budget and putting the leftover toward it — just decided on the
        day instead of found on Sunday. And it can't be used to make the debt
        disappear: spend the week as normal afterwards and the week finishes
        over, which comes straight back here.
      */}
      {balance > 0 &&
        (paying ? (
          <View style={styles.payBox}>
            <FieldLabel>How much can you go without this week?</FieldLabel>
            <MoneyInput
              value={amount}
              onChangeText={(t) => setAmount(sanitizeAmountInput(t))}
              autoFocus
            />
            {wanted > balance && (
              <ThemedText type="small" style={styles.capNote}>
                Only {fmt(balance)} is outstanding, so that is all this will put toward it.
              </ThemedText>
            )}
            <ThemedText type="small" themeColor="textSecondary" style={styles.payNote}>
              This comes off this week&apos;s spending money, the same as an expense would. If you
              end up spending the week anyway, the week finishes over and that amount comes back
              here, so nothing is lost either way.
            </ThemedText>
            <View style={styles.payActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel paying catch-up off"
                onPress={() => {
                  setAmount('');
                  setPaying(false);
                }}
                style={styles.cancel}>
                <ThemedText type="bodyBold" themeColor="textSecondary">
                  Cancel
                </ThemedText>
              </Pressable>
              <View style={styles.flex}>
                <Button
                  title={capped > 0 ? `Put ${fmt(capped)} toward it` : 'Put it toward catch-up'}
                  disabled={!(capped > 0)}
                  loading={saving}
                  onPress={() => onPayFromWeek(capped)}
                />
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.payBox}>
            <Button
              title="Pay some off from this week"
              variant="secondary"
              onPress={() => {
                setAmount('');
                setPaying(true);
              }}
            />
          </View>
        ))}

      <View style={styles.howBox}>
        <ThemedText type="bodyBold" style={styles.howTitle}>
          How this comes down
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.howBody}>
          Three ways, and all of them come from real money. Finish a week under budget and you can
          put the leftover toward it. Log money coming in, from selling something or a bonus, and
          choose &quot;Toward catch-up&quot; instead of adding it to your week. Or decide up front
          to go without some of this week, using the button above.
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
  blurb: { textAlign: 'center', marginTop: Spacing.two, lineHeight: 22 },
  owed: { color: Palette.terracottaDeep },
  clear: { color: Palette.sageDeep },
  payBox: { gap: Spacing.two, marginBottom: Spacing.three },
  capNote: { color: Palette.sandDeep },
  payNote: { lineHeight: 22 },
  payActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
  cancel: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.two },
  howBox: {
    backgroundColor: 'rgba(129,178,154,0.14)',
    borderRadius: Radius.large,
    padding: Spacing.three,
    marginBottom: Spacing.three,
    gap: 2,
  },
  howTitle: { color: Palette.sageDeep },
  howBody: { lineHeight: 22 },
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
