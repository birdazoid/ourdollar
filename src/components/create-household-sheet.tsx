import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { FieldLabel, TextField } from '@/components/inputs';
import { Sheet } from '@/components/sheet';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { AVATAR_OPTIONS } from '@/lib/categories';
import { useHousehold } from '@/lib/household';
import { useCreateHousehold } from '@/lib/queries';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Called with the new household id after it's created and made active. */
  onCreated?: (id: string) => void;
  /** Prefill for the creator's display name (e.g. from their email). */
  defaultName?: string;
};

export function CreateHouseholdSheet({ visible, onClose, onCreated, defaultName = '' }: Props) {
  const { setActiveHousehold } = useHousehold();
  const create = useCreateHousehold();

  const [householdName, setHouseholdName] = useState('');
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<string>(AVATAR_OPTIONS[0]);

  useEffect(() => {
    if (visible) {
      setHouseholdName('');
      setName(defaultName);
      setAvatar(AVATAR_OPTIONS[0]);
      create.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, defaultName]);

  const valid = householdName.trim() !== '' && name.trim() !== '';

  function submit() {
    create.mutate(
      { householdName: householdName.trim(), memberName: name.trim(), avatar },
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

      <FieldLabel>Your name</FieldLabel>
      <TextField placeholder="Your name" value={name} onChangeText={setName} style={styles.mb} />

      <FieldLabel>Your avatar</FieldLabel>
      <View style={styles.avatarGrid}>
        {AVATAR_OPTIONS.map((a) => (
          <Pressable
            key={a}
            accessibilityRole="button"
            accessibilityLabel={`Avatar ${a}`}
            accessibilityState={{ selected: a === avatar }}
            onPress={() => setAvatar(a)}
            style={[styles.avatarOption, a === avatar && styles.avatarSelected]}>
            <ThemedText type="subtitle">{a}</ThemedText>
          </Pressable>
        ))}
      </View>

      {create.isError && (
        <ThemedText type="small" themeColor="warningDeep" style={styles.errText}>
          Couldn&apos;t create the household. Please try again.
        </ThemedText>
      )}

      <Button title="Create household" disabled={!valid} loading={create.isPending} onPress={submit} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  mb: { marginBottom: Spacing.two },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  avatarOption: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    backgroundColor: Palette.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  avatarSelected: { borderColor: Palette.sageDeep, backgroundColor: 'rgba(129,178,154,0.16)' },
  errText: { marginBottom: Spacing.two },
});
