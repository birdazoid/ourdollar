import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import IconCelebrate from '@/assets/icons/icon-celebrate.svg';
import { Button } from '@/components/button';
import { FieldLabel, TextField } from '@/components/inputs';
import { Sheet } from '@/components/sheet';
import { Switch } from '@/components/switch';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import type { NewMemberInput } from '@/lib/queries';

type Props = {
  visible: boolean;
  onClose: () => void;
  onAdd: (input: NewMemberInput) => void;
  saving?: boolean;
};

const emailValid = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

export function AddMemberSheet({ visible, onClose, onAdd, saving }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [funOn, setFunOn] = useState(false);
  const [funMonthly, setFunMonthly] = useState('100');

  useEffect(() => {
    if (visible) {
      setName('');
      setEmail('');
      setFunOn(false);
      setFunMonthly('100');
    }
  }, [visible]);

  // Every new member is invited, so a valid email is always required.
  const valid = name.trim() !== '' && emailValid(email);

  return (
    <Sheet visible={visible} title="Add a household member" onClose={onClose}>
      <FieldLabel>Name</FieldLabel>
      <TextField placeholder="Name" value={name} onChangeText={setName} style={styles.mb} />

      <FieldLabel>Their email</FieldLabel>
      <TextField
        placeholder="name@email.com"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        inputMode="email"
        autoCapitalize="none"
        style={email !== '' && !emailValid(email) ? styles.emailError : undefined}
      />
      {email !== '' && !emailValid(email) ? (
        <ThemedText type="small" themeColor="warningDeep" style={styles.errText}>
          Enter a valid email so we can send their invite.
        </ThemedText>
      ) : (
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          They&apos;ll get an email to download the app and join with their own profile.
        </ThemedText>
      )}

      <Pressable onPress={() => setFunOn(!funOn)} style={[styles.funRow, funOn && styles.funOnRow]}>
        <IconCelebrate width={23} height={23} color={Palette.ink} />
        <View style={styles.flex}>
          <ThemedText type="bodyBold">Give them fun money</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {funOn ? 'A personal, no-questions-asked stash' : 'Optional monthly personal spending'}
          </ThemedText>
        </View>
        <Switch value={funOn} onValueChange={setFunOn} onColor={Palette.sand} />
      </Pressable>

      {funOn && (
        <>
          <FieldLabel>Fun money per month</FieldLabel>
          <TextField
            placeholder="Fun $/mo"
            value={funMonthly}
            onChangeText={(t) => setFunMonthly(t.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            inputMode="numeric"
            style={styles.mb}
          />
        </>
      )}

      <Button
        title="Add & send invite"
        disabled={!valid}
        loading={saving}
        onPress={() =>
          onAdd({
            name: name.trim(),
            funMonthly: funOn ? Number(funMonthly) || 0 : 0,
            inviteEmail: email.trim(),
          })
        }
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  mb: { marginBottom: Spacing.three },
  flex: { flex: 1 },
  hint: { marginTop: Spacing.one, marginBottom: Spacing.three, lineHeight: 18 },
  funRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.card,
    borderRadius: Radius.large,
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  funOnRow: { backgroundColor: 'rgba(242,204,143,0.22)' },
  emailError: { borderWidth: 1.5, borderColor: Palette.terracotta },
  errText: { marginTop: Spacing.one, marginBottom: Spacing.three, marginLeft: Spacing.one },
});
