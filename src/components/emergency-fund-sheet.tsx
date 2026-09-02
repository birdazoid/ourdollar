import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { FieldLabel, MoneyInput, TextField } from '@/components/inputs';
import { Sheet } from '@/components/sheet';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { fmt, goalProgress, groupAmountInput, sanitizeAmountInput } from '@/lib/money';
import type { EmergencyFundEntry } from '@/lib/types';

type Props = {
  visible: boolean;
  balance: number;
  /** What the household is aiming for. 0 = no target set yet. */
  target: number;
  /** Held back from the plan each month. 0 = nothing set aside automatically. */
  monthly: number;
  /** Whether this month's planned amount has already gone in. */
  monthlyDone: boolean;
  entries: EmergencyFundEntry[];
  memberName: (id: string | null) => string | null;
  saving?: boolean;
  onDeposit: (amount: number) => void;
  onWithdraw: (amount: number, note: string) => void;
  onContributeMonthly: () => void;
  onSaveSettings: (target: number, monthly: number) => void;
  onClose: () => void;
};

const KIND_LABEL: Record<EmergencyFundEntry['kind'], string> = {
  deposit: 'Put in',
  monthly: "Month's amount",
  withdrawal: 'Taken out',
  adjustment: 'Adjusted',
};

/** Only one thing at a time: the buttons, or whichever form was opened. */
type Mode = 'idle' | 'in' | 'out' | 'settings';

/**
 * The emergency fund: what's in it, what it's aiming at, how it got there, and
 * a way to take some out when something goes wrong.
 *
 * It's built like a savings goal in the two ways that make a goal actually
 * fill up — a target to aim at and an amount set aside every month — and
 * deliberately unlike one in the two ways that would make it a worse emergency
 * fund. The target never refuses money, because the day you need it is not the
 * day to be told the fund is full. And there is no "funded! 🎉", because that
 * is the wrong thing to say about money you hope never to spend.
 *
 * Money reaches the fund three ways, and the difference between them is the
 * thing this sheet works hardest to explain:
 *
 *   1. The monthly amount, held back before the weekly allowance is divided.
 *      It costs a week nothing, because no week was ever given it.
 *   2. Money put in by hand, which comes straight out of this week.
 *   3. Arriving income tagged for the fund, from the Week screen.
 */
export function EmergencyFundSheet({
  visible,
  balance,
  target,
  monthly,
  monthlyDone,
  entries,
  memberName,
  saving,
  onDeposit,
  onWithdraw,
  onContributeMonthly,
  onSaveSettings,
  onClose,
}: Props) {
  const [mode, setMode] = useState<Mode>('idle');
  const [amount, setAmount] = useState('');
  const [targetField, setTargetField] = useState('');
  const [monthlyField, setMonthlyField] = useState('');

  // Reset on close during render rather than in an effect, which is the pattern
  // React documents for reacting to a prop change.
  const [wasVisible, setWasVisible] = useState(visible);
  if (wasVisible !== visible) {
    setWasVisible(visible);
    if (!visible) {
      setAmount('');
      setMode('idle');
    }
  }

  function openSettings() {
    setTargetField(target > 0 ? String(target) : '');
    setMonthlyField(monthly > 0 ? String(monthly) : '');
    setMode('settings');
  }

  const amountNum = Number(amount);
  const wanted = Number.isFinite(amountNum) ? amountNum : 0;
  const capped = Math.min(wanted, balance); // withdrawals only
  const hasTarget = target > 0;
  const pct = goalProgress(balance, target);
  const toGo = Math.max(0, Math.round((target - balance) * 100) / 100);
  const past = hasTarget && balance >= target;
  // Null when nothing is set aside monthly, since "never" is not a useful thing
  // to print next to a fund someone is trying to build.
  const monthsToGo = hasTarget && !past && monthly > 0 ? Math.ceil(toGo / monthly) : null;

  const newTarget = Number(sanitizeAmountInput(targetField) || 0);
  const newMonthly = Number(sanitizeAmountInput(monthlyField) || 0);
  const settingsValid =
    Number.isFinite(newTarget) && Number.isFinite(newMonthly) && newTarget >= 0 && newMonthly >= 0;

  return (
    <Sheet visible={visible} title="Emergency fund" onClose={onClose}>
      <Card style={styles.headline}>
        <ThemedText type="small" themeColor="textSecondary">
          {balance > 0 ? 'Set aside for emergencies' : 'Nothing set aside yet'}
        </ThemedText>
        <ThemedText type="display" style={styles.amount}>
          {fmt(balance)}
        </ThemedText>

        {hasTarget && (
          <View style={styles.progressBlock}>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${pct * 100}%` }]} />
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              {past ? (
                // Passing the target is worth saying out loud, and worth
                // saying in a way that doesn't sound finished.
                <>
                  Past your {fmt(target)} target. You can keep adding to it.
                </>
              ) : (
                <>
                  {Math.round(pct * 100)}% of your {fmt(target)} target · {fmt(toGo)} to go
                  {monthsToGo != null
                    ? ` · about ${monthsToGo} more month${monthsToGo === 1 ? '' : 's'} at ${fmt(monthly)} a month`
                    : ''}
                </>
              )}
            </ThemedText>
          </View>
        )}

        <ThemedText type="small" themeColor="textSecondary" style={styles.blurb}>
          {balance > 0
            ? 'This sits outside your weekly money, so it never gets spent by accident. Taking some out adds it to this week, so an emergency does not eat a week that never had it.'
            : 'Set an amount to put in each month, or add money whenever you have some spare. It sits outside your weekly money, so it never gets spent by accident.'}
        </ThemedText>
      </Card>

      {/* The monthly amount. Kept above the two buttons because it's the part
          that fills the fund on its own, and it needs saying that it has
          already been taken out of the plan. */}
      {monthly > 0 && mode === 'idle' && (
        <View style={styles.monthlyBox}>
          {monthlyDone ? (
            <View style={styles.doneRow}>
              <View style={styles.doneBadge}>
                <Check size={13} color={Palette.card} strokeWidth={3} />
              </View>
              <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
                This month&apos;s {fmt(monthly)} is already in.
              </ThemedText>
            </View>
          ) : (
            <>
              <Button title={`Put this month's ${fmt(monthly)} in`} onPress={onContributeMonthly} />
              <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
                This {fmt(monthly)} was already held back before your weekly money was worked out,
                so putting it in costs this week nothing.
              </ThemedText>
            </>
          )}
        </View>
      )}

      {mode === 'in' && (
        <View style={styles.formBox}>
          <FieldLabel>How much do you want to put in?</FieldLabel>
          <MoneyInput
            value={amount}
            onChangeText={(t) => setAmount(sanitizeAmountInput(t))}
            autoFocus
          />
          <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
            This comes out of this week&apos;s spending money, the same as an expense would. Money
            arriving that you never planned to spend is better sent straight in from the Week
            screen instead.
          </ThemedText>
          <View style={styles.formActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel putting money in"
              onPress={() => {
                setAmount('');
                setMode('idle');
              }}
              style={styles.cancel}>
              <ThemedText type="bodyBold" themeColor="textSecondary">
                Cancel
              </ThemedText>
            </Pressable>
            <View style={styles.flex}>
              <Button
                title={wanted > 0 ? `Put in ${fmt(wanted)}` : 'Put in'}
                disabled={!(wanted > 0)}
                loading={saving}
                onPress={() => onDeposit(Math.round(wanted * 100) / 100)}
              />
            </View>
          </View>
        </View>
      )}

      {mode === 'out' && (
        <View style={styles.formBox}>
          <FieldLabel>How much do you need?</FieldLabel>
          <MoneyInput
            value={amount}
            onChangeText={(t) => setAmount(sanitizeAmountInput(t))}
            autoFocus
          />
          {wanted > balance && (
            <ThemedText type="small" style={styles.capNote}>
              Only {fmt(balance)} is in the fund, so that is all this will take.
            </ThemedText>
          )}
          <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
            This goes into this week&apos;s spending money, so logging what you spend it on leaves
            the week where it started.
          </ThemedText>
          <View style={styles.formActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel taking money out"
              onPress={() => {
                setAmount('');
                setMode('idle');
              }}
              style={styles.cancel}>
              <ThemedText type="bodyBold" themeColor="textSecondary">
                Cancel
              </ThemedText>
            </Pressable>
            <View style={styles.flex}>
              <Button
                title={capped > 0 ? `Take out ${fmt(capped)}` : 'Take out'}
                disabled={!(capped > 0)}
                loading={saving}
                onPress={() => onWithdraw(capped, 'From emergency fund')}
              />
            </View>
          </View>
        </View>
      )}

      {mode === 'settings' && (
        <View style={styles.formBox}>
          <View style={styles.fieldRow}>
            <View style={styles.flex}>
              <FieldLabel>Target</FieldLabel>
              <Card style={styles.inlineField}>
                <ThemedText type="body" themeColor="textSecondary">
                  $
                </ThemedText>
                <TextField
                  placeholder="amount"
                  value={groupAmountInput(targetField)}
                  onChangeText={(t) => setTargetField(sanitizeAmountInput(t))}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  style={styles.inlineInput}
                />
              </Card>
            </View>
            <View style={styles.flex}>
              <FieldLabel>Per month</FieldLabel>
              <Card style={styles.inlineField}>
                <ThemedText type="body" themeColor="textSecondary">
                  $
                </ThemedText>
                <TextField
                  placeholder="amount"
                  value={groupAmountInput(monthlyField)}
                  onChangeText={(t) => setMonthlyField(sanitizeAmountInput(t))}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  style={styles.inlineInput}
                />
              </Card>
            </View>
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
            The monthly amount is set aside before your weekly money is worked out, so a week never
            has to give it back. {newMonthly > 0 ? `${fmt(newMonthly)} a month lowers each week by about ${fmt(Math.round((newMonthly / 4) * 100) / 100)}.` : 'Leave it at 0 to add money only when you choose to.'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
            The target is only something to aim at. Reaching it does not stop the monthly amount or
            turn any money away, so set it to what would genuinely cover a bad month.
          </ThemedText>
          <View style={styles.formActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel changing the target"
              onPress={() => setMode('idle')}
              style={styles.cancel}>
              <ThemedText type="bodyBold" themeColor="textSecondary">
                Cancel
              </ThemedText>
            </Pressable>
            <View style={styles.flex}>
              <Button
                title="Save"
                disabled={!settingsValid}
                loading={saving}
                onPress={() => {
                  onSaveSettings(newTarget, newMonthly);
                  setMode('idle');
                }}
              />
            </View>
          </View>
        </View>
      )}

      {mode === 'idle' && (
        <>
          <View style={styles.buttonRow}>
            <View style={styles.flex}>
              <Button
                title="Put money in"
                onPress={() => {
                  setAmount('');
                  setMode('in');
                }}
              />
            </View>
            {balance > 0 && (
              <View style={styles.flex}>
                <Button
                  title="Take some out"
                  variant="secondary"
                  onPress={() => {
                    setAmount('');
                    setMode('out');
                  }}
                />
              </View>
            )}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hasTarget || monthly > 0 ? 'Change target and monthly amount' : 'Set a target and monthly amount'}
            onPress={openSettings}
            style={styles.settingsRow}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
              {hasTarget || monthly > 0
                ? `Aiming for ${hasTarget ? fmt(target) : 'no target'}${monthly > 0 ? ` · ${fmt(monthly)} a month` : ' · nothing monthly'}`
                : 'No target yet'}
            </ThemedText>
            <ThemedText type="small" style={styles.link}>
              {hasTarget || monthly > 0 ? 'Change' : 'Set a target'}
            </ThemedText>
          </Pressable>
        </>
      )}

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
  center: { textAlign: 'center' },
  headline: { alignItems: 'center', gap: 2, marginBottom: Spacing.three },
  amount: { color: Palette.sageDeep },
  progressBlock: { alignSelf: 'stretch', gap: Spacing.two, marginTop: Spacing.two },
  track: {
    height: 8,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(61,64,91,0.08)',
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: Radius.pill, backgroundColor: Palette.sage },
  blurb: { textAlign: 'center', marginTop: Spacing.two, lineHeight: 22 },
  in: { color: Palette.sageDeep },
  out: { color: Palette.ink },
  monthlyBox: { gap: Spacing.two, marginBottom: Spacing.three },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: Palette.card,
    borderRadius: Radius.large,
    padding: Spacing.three,
  },
  doneBadge: {
    width: 22,
    height: 22,
    borderRadius: Radius.pill,
    backgroundColor: Palette.sageDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formBox: { gap: Spacing.two, marginBottom: Spacing.three },
  fieldRow: { flexDirection: 'row', gap: Spacing.two },
  inlineField: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 0,
    paddingHorizontal: Spacing.three,
  },
  inlineInput: { flex: 1, backgroundColor: 'transparent', height: 52 },
  capNote: { color: Palette.sandDeep },
  note: { lineHeight: 22 },
  formActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
  buttonRow: { flexDirection: 'row', gap: Spacing.two },
  cancel: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.two },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
  link: { color: Palette.sageDeep },
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
