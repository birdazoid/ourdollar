import { Check, Pencil, Trash2 } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { Sheet } from '@/components/sheet';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { billEmoji } from '@/lib/categories';
import { fmt } from '@/lib/money';
import { ordinal } from '@/lib/format';
import type { Bill, HouseholdMember } from '@/lib/types';

type Props = {
  bill: Bill | null;
  paidByName?: string | null;
  onClose: () => void;
  onPay: (bill: Bill) => void;
  onEdit: (bill: Bill) => void;
  onDelete: (id: string) => void;
};

export function BillDetailSheet({ bill, paidByName, onClose, onPay, onEdit, onDelete }: Props) {
  return (
    <Sheet visible={!!bill} title={bill ? `${billEmoji(bill.category)} ${bill.name}` : undefined} onClose={onClose}>
      {bill && (
        <>
          <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
            {bill.category} · {bill.paid ? `paid ${paidByName ? `by ${paidByName} ` : ''}${bill.paid_on ?? ''}` : `due the ${ordinal(bill.due_day ?? 0)}`}
          </ThemedText>

          <Card style={styles.infoCard}>
            <ThemedText type="body" themeColor="textSecondary" style={styles.infoText}>
              {bill.varies
                ? 'Amount varies month to month — confirm the amount when you mark it paid.'
                : `Fixed — steady ${fmt(bill.amount)}/mo.`}
            </ThemedText>
          </Card>

          <View style={styles.actions}>
            {!bill.paid && (
              <Pressable
                accessibilityRole="button"
                style={[styles.flex, styles.payBtn]}
                onPress={() => onPay(bill)}>
                <Check size={18} color={Palette.card} />
                <ThemedText type="bodyBold" style={styles.payText}>
                  Mark paid
                </ThemedText>
              </Pressable>
            )}
            <Pressable style={[styles.flex, styles.editBtn]} onPress={() => onEdit(bill)}>
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
  sub: { marginTop: -Spacing.two, marginBottom: Spacing.three },
  infoCard: { marginBottom: Spacing.three },
  infoText: {},
  actions: { flexDirection: 'row', gap: Spacing.two, alignItems: 'stretch' },
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
