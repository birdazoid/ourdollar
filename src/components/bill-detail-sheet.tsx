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
import { monthLabel } from '@/lib/month-review';
import type { Bill, BillMonthLine } from '@/lib/types';

type Props = {
  bill: Bill | null;
  paidByName?: string | null;
  /** Closed months this bill has a record for, newest first. */
  history?: BillMonthLine[];
  historyLoading?: boolean;
  onClose: () => void;
  onPay: (bill: Bill, amount: number) => void;
  onEdit: (bill: Bill) => void;
  onDelete: (id: string) => void;
  saving?: boolean;
};

/**
 * " · $62 more than August" for the most recent pair of months on record.
 *
 * Only when both months have a figure. A `varies` bill that was never given an
 * estimate has a null actual, and "$483 more than August" would be nonsense
 * when August's number is simply unknown rather than zero.
 */
function changeNote(history: BillMonthLine[]): string | null {
  const withFigures = history.filter((h) => h.actual != null);
  if (withFigures.length < 2) return null;
  const [latest, previous] = withFigures;
  const delta = Math.round((Number(latest.actual) - Number(previous.actual)) * 100) / 100;
  if (delta === 0) return `Same as ${monthLabel(previous.month).split(' ')[0]}`;
  return `${fmt(Math.abs(delta))} ${delta > 0 ? 'more' : 'less'} than ${monthLabel(previous.month).split(' ')[0]}`;
}

/** Bill detail: shows status, lets you confirm/adjust the amount and mark paid, then edit or delete — all in one sheet. */
export function BillDetailSheet({
  bill,
  paidByName,
  history = [],
  historyLoading,
  onClose,
  onPay,
  onEdit,
  onDelete,
  saving,
}: Props) {
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
          {/* What it has cost, month by month. Only closed months appear:
              this month's figure is still on the bill itself above, and it
              isn't history until the month is done. */}
          <View style={styles.historyBlock}>
            <ThemedText type="bodyBold" style={styles.historyTitle}>
              What it has cost
            </ThemedText>
            {historyLoading ? (
              <ThemedText type="small" themeColor="textSecondary">
                Loading…
              </ThemedText>
            ) : history.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.historyNote}>
                Nothing recorded yet. Each bill&apos;s amount is saved when the month closes, so
                this fills in from the end of this month onward.
              </ThemedText>
            ) : (
              <>
                {changeNote(history) && (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.historyNote}>
                    {changeNote(history)}
                  </ThemedText>
                )}
                {history.map((h) => (
                  <View key={h.id} style={styles.historyRow}>
                    <ThemedText type="body" style={styles.flex}>
                      {monthLabel(h.month)}
                    </ThemedText>
                    {/* An unpaid month is worth saying out loud: the figure
                        beside it is the estimate, not what was paid. */}
                    {!h.paid && (
                      <ThemedText type="small" style={styles.unpaidTag}>
                        not paid
                      </ThemedText>
                    )}
                    <ThemedText type="bodyBold">
                      {h.actual != null ? fmt(Number(h.actual)) : '—'}
                    </ThemedText>
                  </View>
                ))}
              </>
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
  historyBlock: { marginTop: Spacing.four, gap: Spacing.two },
  historyTitle: {},
  historyNote: { lineHeight: 22 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: Palette.card,
    borderRadius: Radius.large,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  unpaidTag: { color: Palette.terracottaDeep },
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
