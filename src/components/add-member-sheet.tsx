import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

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
  const [funMonthly, setFunMonthly] = useState('100');
  const [sendInvite, setSendInvite] = useState(true);
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (visible) {
      setName('');
      setFunMonthly('100');
      setSendInvite(true);
      setEmail('');
    }
  }, [visible]);

  const valid = name.trim() !== '' && (!sendInvite || emailValid(email));

  return (
    <Sheet visible={visible} title="Add a household member" onClose={onClose}>
      <TextField placeholder="Name" value={name} onChangeText={setName} style={styles.mb} />

      <FieldLabel>Fun money per month</FieldLabel>
      <TextField
        placeholder="Fun $/mo"
        value={funMonthly}
        onChangeText={(t) => setFunMonthly(t.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        inputMode="numeric"
        style={styles.mb}
      />

      <Pressable
        onPress={() => setSendInvite(!sendInvite)}
        style={[styles.inviteRow, sendInvite && styles.inviteOn]}>
        <ThemedText type="subtitle">✉️</ThemedText>
        <View style={styles.flex}>
          <ThemedText type="bodyBold">Send them an invite</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {sendInvite
              ? "They'll get an email to download the app and create an account"
              : 'Add without an account — fun money tracking only'}
          </ThemedText>
        </View>
        <Switch value={sendInvite} onValueChange={setSendInvite} />
      </Pressable>

      {sendInvite && (
        <View style={styles.emailWrap}>
          <FieldLabel>Their email</FieldLabel>
          <TextField
            placeholder="name@email.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            inputMode="email"
            autoCapitalize="none"
            style={email && !emailValid(email) ? styles.emailError : undefined}
          />
          {email !== '' && !emailValid(email) && (
            <ThemedText type="small" themeColor="warningDeep" style={styles.errText}>
              Enter a valid email so we know where to send the invite.
            </ThemedText>
          )}
        </View>
      )}

      <Button
        title={sendInvite ? 'Add & send invite' : 'Add member'}
        disabled={!valid}
        loading={saving}
        onPress={() =>
          onAdd({
            name: name.trim(),
            funMonthly: Number(funMonthly) || 0,
            inviteEmail: sendInvite ? email.trim() : null,
          })
        }
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  mb: { marginBottom: Spacing.three },
  flex: { flex: 1 },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.card,
    borderRadius: Radius.large,
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  inviteOn: { backgroundColor: 'rgba(129,178,154,0.16)' },
  emailWrap: { marginBottom: Spacing.three },
  emailError: { borderWidth: 1.5, borderColor: Palette.terracotta },
  errText: { marginTop: Spacing.one, marginLeft: Spacing.one },
});
