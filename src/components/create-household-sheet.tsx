import { X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { FieldLabel, TextField } from '@/components/inputs';
import { Sheet } from '@/components/sheet';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useHousehold } from '@/lib/household';
import { useCreateHousehold } from '@/lib/queries';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Called with the new household id after it's created and made active. */
  onCreated?: (id: string) => void;
};

const emailValid = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

export function CreateHouseholdSheet({ visible, onClose, onCreated }: Props) {
  const { setActiveHousehold } = useHousehold();
  const create = useCreateHousehold();

  const [householdName, setHouseholdName] = useState('');
  const [email, setEmail] = useState('');
  const [invites, setInvites] = useState<string[]>([]);

  useEffect(() => {
    if (visible) {
      setHouseholdName('');
      setEmail('');
      setInvites([]);
      create.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const canAddEmail = emailValid(email) && !invites.includes(email.trim().toLowerCase());
  const valid = householdName.trim() !== '';

  function addEmail() {
    if (!canAddEmail) return;
    setInvites((list) => [...list, email.trim().toLowerCase()]);
    setEmail('');
  }

  function submit() {
    create.mutate(
      { householdName: householdName.trim(), inviteEmails: invites },
      {
        onSuccess: (id) => {
          setActiveHousehold(id);
          onCreated?.(id);
          onClose();
        },
      }
    );
  }

  return (
    <Sheet visible={visible} title="Create a household" onClose={onClose}>
      <FieldLabel>Household name</FieldLabel>
      <TextField
        placeholder="e.g. Home, The Smiths"
        value={householdName}
        onChangeText={setHouseholdName}
        style={styles.mb}
      />

      <FieldLabel>Invite others (optional)</FieldLabel>
      <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
        They&apos;ll get an email and can join with their own profile. You can also invite people
        later.
      </ThemedText>
      <View style={styles.inviteRow}>
        <TextField
          placeholder="name@email.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          inputMode="email"
          autoCapitalize="none"
          style={styles.inviteInput}
          onSubmitEditing={addEmail}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add invite"
          onPress={addEmail}
          disabled={!canAddEmail}
          style={[styles.addBtn, !canAddEmail && styles.addBtnDisabled]}>
          <ThemedText type="label" style={styles.addBtnText}>
            Add
          </ThemedText>
        </Pressable>
      </View>

      {invites.length > 0 && (
        <View style={styles.chips}>
          {invites.map((e) => (
            <View key={e} style={styles.chip}>
              <ThemedText type="small">{e}</ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${e}`}
                hitSlop={6}
                onPress={() => setInvites((list) => list.filter((x) => x !== e))}>
                <X size={14} color={Palette.ink} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {create.isError && (
        <ThemedText type="small" themeColor="warningDeep" style={styles.err}>
          Couldn&apos;t create the household. Please try again.
        </ThemedText>
      )}

      <Button
        title="Create household"
        disabled={!valid}
        loading={create.isPending}
        onPress={submit}
        style={styles.submit}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  mb: { marginBottom: Spacing.two },
  hint: { marginBottom: Spacing.two, lineHeight: 18 },
  inviteRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  inviteInput: { flex: 1 },
  addBtn: {
    height: 52,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.large,
    backgroundColor: Palette.sage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnDisabled: { opacity: 0.4 },
  addBtnText: { color: Palette.card },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.three },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: 'rgba(129,178,154,0.16)',
    borderRadius: Radius.pill,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  err: { marginTop: Spacing.three },
  submit: { marginTop: Spacing.four },
});
