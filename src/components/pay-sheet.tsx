import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { MoneyInput } from '@/components/inputs';
import { Sheet } from '@/components/sheet';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { billEmoji } from '@/lib/categories';
import { ordinal } from '@/lib/format';
import { fmt } from '@/lib/money';
import type { Bill } from '@/lib/types';

type Props = {
  bill: Bill | null;
  onClose: () => void;
  onConfirm: (amount: number) => void;
  saving?: boolean;
};

/** Confirm-amount sheet shown when marking a bill paid (design-brief §8). */
export function PaySheet({ bill, onClose, onConfirm, saving }: Props) {
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (bill) setAmount(bill.amount != null ? String(bill.amount) : '');
  }, [bill]);

  const amountNum = Number(amount);
  const valid = amount !== '' && !Number.isNaN(amountNum);

  return (
    <Sheet visible={!!bill} title={bill ? `${billEmoji(bill.category)} ${bill.name}` : undefined} onClose={onClose}>
      {bill && (
        <>
          <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
            Due the {ordinal(bill.due_day ?? 0)}
            {bill.varies ? ' · confirm amount below' : ''}
          </ThemedText>
          <MoneyInput value={amount} onChangeText={setAmount} size={34} autoFocus />
          <Button
            title={`Mark paid${valid ? ' · ' + fmt(amountNum) : ''}`}
            disabled={!valid}
            loading={saving}
            onPress={() => onConfirm(amountNum)}
            style={styles.btn}
          />
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sub: { marginTop: -Spacing.two, marginBottom: Spacing.three },
  btn: { marginTop: Spacing.three },
});
