import { Check, Pencil, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { MoneyInput } from '@/components/inputs';
import { Sheet } from '@/components/sheet';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { billEmoji } from '@/lib/categories';
import { ordinal } from '@/lib/format';
import { fmt } from '@/lib/money';
import type { Bill } from '@/lib/types';

type Props = {
  bill: Bill | null;
  paidByName?: string | null;
  onClose: () => void;
  onPay: (bill: Bill, amount: number) => void;
  onEdit: (bill: Bill) => void;
  onDelete: (id: string) => void;
  saving?: boolean;
};

/** Bill detail: shows status, lets you confirm/adjust the amount and mark paid, then edit or delete — all in one sheet. */
export function BillDetailSheet({ bill, paidByName, onClose, onPay, onEdit, onDelete, saving }: Props) {
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (bill) setAmount(bill.amount != null ? String(bill.amount) : '');
  }, [bill]);

  const amountNum = Number(amount);
  const validAmount = amount !== '' && !Number.isNaN(amountNum);

  return (
    <Sheet visible={!!bill} title={bill ? `${billEmoji(bill.category)} ${bill.name}` : undefined} onClose={onClose}>
      {bill && (
        <>
          <ThemedText type="body" themeColor="textSecondary" style={styles.sub}>
            {bill.category} · {bill.paid ? `paid ${paidByName ? `by ${paidByName} ` : ''}${bill.paid_on ?? ''}` : `due the ${ordinal(bill.due_day ?? 0)}`}
          </ThemedText>

          {bill.paid ? (
            <Card style={styles.infoCard}>
              <ThemedText type="body" themeColor="textSecondary">
                {bill.varies ? `Varies month to month — paid ${fmt(bill.amount)} this time.` : `Fixed — steady ${fmt(bill.amount)}/mo.`}
              </ThemedText>
            </Card>
          ) : (
            <>
              {bill.varies && (
                <ThemedText type="small" themeColor="textSecondary" style={styles.variesNote}>
                  Amount varies month to month — adjust it below if needed.
                </ThemedText>
              )}
              <MoneyInput value={amount} onChangeText={setAmount} size={34} />
            </>
          )}

          <View style={styles.actions}>
            {!bill.paid && (
              <Pressable
                accessibilityRole="button"
                disabled={!validAmount}
                style={[styles.flex, styles.payBtn, !validAmount && styles.payBtnDisabled]}
                onPress={() => onPay(bill, amountNum)}>
                <Check size={18} color={Palette.card} />
                <ThemedText type="bodyBold" style={styles.payText}>
                  {saving ? 'Marking paid…' : `Mark paid${validAmount ? ' · ' + fmt(amountNum) : ''}`}
                </ThemedText>
              </Pressable>
            )}
          </View>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit bill"
              style={[styles.flex, styles.editBtn]}
              onPress={() => onEdit(bill)}>
              <Pencil size={16} color={Palette.ink} />
              <ThemedText type="bodyBold">Edit</ThemedText>
            </Pressable>
            <Pressable
              accessibilityLabel="Delete bill"
              style={styles.deleteBtn}
              onPress={() => onDelete(bill.id)}>
              <Trash2 size={18} color={Palette.terracottaDeep} />
            </Pressable>
          </View>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sub: { marginBottom: Spacing.three },
  infoCard: { marginBottom: Spacing.three },
  variesNote: { marginBottom: Spacing.two },
  actions: { flexDirection: 'row', gap: Spacing.two, alignItems: 'stretch', marginTop: Spacing.three },
  flex: { flex: 1 },
  payBtn: {
    flexDirection: 'row',
    gap: Spacing.two,
    height: 52,
    borderRadius: Radius.large,
    backgroundColor: Palette.sageDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payBtnDisabled: { opacity: 0.5 },
  payText: { color: Palette.card },
  editBtn: {
    flexDirection: 'row',
    gap: Spacing.two,
    height: 52,
    borderRadius: Radius.large,
    backgroundColor: Palette.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    width: 52,
    height: 52,
    borderRadius: Radius.large,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(224,122,95,0.14)',
  },
});
