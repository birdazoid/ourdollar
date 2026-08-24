import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { FieldLabel, MoneyInput } from '@/components/inputs';
import { Sheet } from '@/components/sheet';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { fmt, sanitizeAmountInput } from '@/lib/money';
import type { EmergencyFundEntry } from '@/lib/types';

type Props = {
  visible: boolean;
  balance: number;
  entries: EmergencyFundEntry[];
  memberName: (id: string | null) => string | null;
  saving?: boolean;
  onWithdraw: (amount: number, note: string) => void;
  onClose: () => void;
};

const KIND_LABEL: Record<EmergencyFundEntry['kind'], string> = {
  deposit: 'Put in',
  withdrawal: 'Taken out',
  adjustment: 'Adjusted',
};

/**
 * The emergency fund: what's in it, how it got there, and a way to take some
 * out when something goes wrong.
 *
 * Money only goes IN by assigning income to it, the same rule catch-up follows,
 * so the balance never moves without real money behind it. Taking money out is
 * a button here because this IS the moment the money is needed, and it raises
 * the week so the emergency doesn't eat a budget that never held it.
 */
export function EmergencyFundSheet({
  visible,
  balance,
  entries,
  memberName,
  saving,
  onWithdraw,
  onClose,
}: Props) {
  const [amount, setAmount] = useState('');
  const [taking, setTaking] = useState(false);

  // Reset on close during render rather than in an effect, which is the pattern
  // React documents for reacting to a prop change.
  const [wasVisible, setWasVisible] = useState(visible);
  if (wasVisible !== visible) {
    setWasVisible(visible);
    if (!visible) {
      setAmount('');
      setTaking(false);
    }
  }

  const amountNum = Number(amount);
  const capped = Math.min(Number.isFinite(amountNum) ? amountNum : 0, balance);
  const valid = capped > 0;

  return (
    <Sheet visible={visible} title="Emergency fund" onClose={onClose}>
      <Card style={styles.headline}>
        <ThemedText type="small" themeColor="textSecondary">
          {balance > 0 ? 'Set aside for emergencies' : 'Nothing set aside yet'}
        </ThemedText>
        <ThemedText type="display" style={styles.amount}>
          {fmt(balance)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.blurb}>
          {balance > 0
            ? 'This sits outside your weekly money, so it never gets spent by accident. Taking some out adds it to this week, so an emergency does not eat a week that never had it.'
            : 'When money comes in, choose "Toward the emergency fund" to start building it up.'}
        </ThemedText>
      </Card>

      {balance > 0 &&
        (taking ? (
          <View style={styles.takeBox}>
            <FieldLabel>How much do you need?</FieldLabel>
            <MoneyInput
              value={amount}
              onChangeText={(t) => setAmount(sanitizeAmountInput(t))}
              autoFocus
            />
            {amountNum > balance && (
              <ThemedText type="small" style={styles.capNote}>
                Only {fmt(balance)} is in the fund, so that is all this will take.
              </ThemedText>
            )}
            <ThemedText type="small" themeColor="textSecondary" style={styles.takeNote}>
              This goes into this week&apos;s spending money, so logging what you spend it on
              leaves the week where it started.
            </ThemedText>
            <View style={styles.takeActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel taking money out"
                onPress={() => setTaking(false)}
                style={styles.cancel}>
                <ThemedText type="bodyBold" themeColor="textSecondary">
                  Cancel
                </ThemedText>
              </Pressable>
              <View style={styles.flex}>
                <Button
                  title={valid ? `Take out ${fmt(capped)}` : 'Take out'}
                  disabled={!valid}
                  loading={saving}
                  onPress={() => onWithdraw(capped, 'From emergency fund')}
                />
              </View>
            </View>
          </View>
        ) : (
          <Button title="Take some out" variant="secondary" onPress={() => setTaking(true)} />
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
              <ThemedText type="bodyBold" style={adds ? styles.in : styles.out}>
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
  amount: { color: Palette.sageDeep },
  blurb: { textAlign: 'center', marginTop: Spacing.two, lineHeight: 22 },
  in: { color: Palette.sageDeep },
  out: { color: Palette.ink },
  takeBox: { gap: Spacing.two, marginBottom: Spacing.three },
  capNote: { color: Palette.sandDeep },
  takeNote: { lineHeight: 22 },
  takeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
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
