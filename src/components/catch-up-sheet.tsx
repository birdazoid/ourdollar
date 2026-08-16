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
  onPay: (amount: number, note: string) => void;
  onClose: () => void;
};

const KIND_LABEL: Record<CatchUpEntry['kind'], string> = {
  week_overage: 'Went over',
  payment: 'Paid off',
  adjustment: 'Adjusted',
};

/**
 * The catch-up balance in full: what's owed, where each piece came from, and a
 * way to pay some off.
 *
 * The history is the point. A single number labelled "you owe $563" invites
 * exactly the question the app couldn't answer before, so every movement is
 * listed with the week it came from or the note attached to the payment.
 */
export function CatchUpSheet({
  visible,
  balance,
  entries,
  memberName,
  saving,
  onPay,
  onClose,
}: Props) {
  const [amount, setAmount] = useState('');
  const [paying, setPaying] = useState(false);

  // Reset on close, adjusted during render rather than in an effect. Setting
  // state from an effect makes the React Compiler bail out of optimising the
  // component, and this is the pattern React documents for reacting to a prop
  // change: compare against the previous value and correct in the same pass.
  const [wasVisible, setWasVisible] = useState(visible);
  if (wasVisible !== visible) {
    setWasVisible(visible);
    if (!visible) {
      setAmount('');
      setPaying(false);
    }
  }

  const amountNum = Number(amount);
  // Never more than is owed: overpaying would drive the balance below zero and
  // read as the household being owed money by itself.
  const capped = Math.min(Number.isFinite(amountNum) ? amountNum : 0, balance);
  const valid = capped > 0;

  return (
    <Sheet visible={visible} title="Catch-up" onClose={onClose}>
      <Card style={styles.headline}>
        <ThemedText type="small" themeColor="textSecondary">
          {balance > 0 ? 'Still to pay off' : 'All caught up'}
        </ThemedText>
        <ThemedText type="display" style={balance > 0 ? styles.owed : styles.clear}>
          {fmt(balance)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.blurb}>
          {balance > 0
            ? "This is money you've already spent, kept on record so it isn't forgotten. It doesn't come out of your weekly money, so pay it off whenever suits."
            : "Nothing outstanding. Weeks that go over can be sent here instead of eating into the next week."}
        </ThemedText>
      </Card>

      {balance > 0 &&
        (paying ? (
          <View style={styles.payBox}>
            <FieldLabel>How much are you paying off?</FieldLabel>
            <MoneyInput value={amount} onChangeText={(t) => setAmount(sanitizeAmountInput(t))} autoFocus />
            {amountNum > balance && (
              <ThemedText type="small" style={styles.capNote}>
                Only {fmt(balance)} is owed, so that&apos;s all this will take off.
              </ThemedText>
            )}
            <View style={styles.payActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel paying off"
                onPress={() => setPaying(false)}
                style={styles.cancel}>
                <ThemedText type="bodyBold" themeColor="textSecondary">
                  Cancel
                </ThemedText>
              </Pressable>
              <View style={styles.flex}>
                <Button
                  title={valid ? `Pay off ${fmt(capped)}` : 'Pay off'}
                  disabled={!valid}
                  loading={saving}
                  onPress={() => onPay(capped, 'Paid off')}
                />
              </View>
            </View>
          </View>
        ) : (
          <Button title="Pay some off" variant="secondary" onPress={() => setPaying(true)} />
        ))}

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
  payBox: { gap: Spacing.two, marginBottom: Spacing.three },
  capNote: { color: Palette.sandDeep },
  payActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginTop: Spacing.two },
  cancel: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.two },
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
