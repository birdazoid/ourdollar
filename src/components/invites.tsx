import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { CreateHouseholdSheet } from '@/components/create-household-sheet';
import { Sheet } from '@/components/sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useHousehold } from '@/lib/household';
import { useInviteResponses, type PendingInvite } from '@/lib/queries';

const onInviteError = () =>
  Alert.alert("Couldn't reach the server", 'Check your connection and try again.');

/** One invite: who invited you to which household, with Decline / Join. */
function InviteRow({
  invite,
  onAccept,
  onDecline,
  busy,
}: {
  invite: PendingInvite;
  onAccept: () => void;
  onDecline: () => void;
  busy: boolean;
}) {
  return (
    <Card style={styles.row}>
      <ThemedText type="bodyBold">{invite.household_name}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.rowSub}>
        {invite.inviter_name} invited you to join their household
      </ThemedText>
      <View style={styles.rowActions}>
        <View style={styles.flex}>
          <Button title="Decline" variant="secondary" onPress={onDecline} disabled={busy} />
        </View>
        <View style={styles.flex}>
          <Button title="Join" onPress={onAccept} loading={busy} />
        </View>
      </View>
    </Card>
  );
}

/**
 * Overlay bottom-sheet that pops when a signed-in user (already in at least one
 * household) has invites waiting. Closable; re-opens when a *new* invite arrives
 * so a dismissal doesn't hide a later one.
 */
export function InviteInbox() {
  const { pendingInvites } = useHousehold();
  const { accept, decline } = useInviteResponses();

  const ids = pendingInvites
    .map((i) => i.member_id)
    .sort()
    .join(',');
  const [seenIds, setSeenIds] = useState('');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (ids && ids !== seenIds) {
      setDismissed(false);
      setSeenIds(ids);
    }
  }, [ids, seenIds]);

  const busy = accept.isPending || decline.isPending;
  const visible = pendingInvites.length > 0 && !dismissed;

  return (
    <Sheet
      visible={visible}
      title={pendingInvites.length > 1 ? "You've been invited" : 'New household invite'}
      onClose={() => setDismissed(true)}>
      <ThemedText type="body" themeColor="textSecondary" style={styles.intro}>
        Join to share bills, savings goals, and weekly spending together.
      </ThemedText>
      {pendingInvites.map((inv) => (
        <InviteRow
          key={inv.member_id}
          invite={inv}
          busy={busy}
          onAccept={() => accept.mutate(inv.member_id, { onError: onInviteError })}
          onDecline={() => decline.mutate(inv.member_id, { onError: onInviteError })}
        />
      ))}
    </Sheet>
  );
}

/**
 * Full-screen state for a user who has NO households of their own but has one or
 * more invites waiting — shown instead of "create your first household". They
 * can join an invite, or fall back to creating their own household.
 */
export function InviteWelcome() {
  const { pendingInvites } = useHousehold();
  const { accept, decline } = useInviteResponses();
  const [createOpen, setCreateOpen] = useState(false);

  const busy = accept.isPending || decline.isPending;

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <View style={styles.welcomeBody}>
          <View style={styles.badge}>
            <ThemedText type="display">✉️</ThemedText>
          </View>
          <ThemedText type="title" style={styles.center}>
            {pendingInvites.length > 1 ? "You've been invited" : "You've got an invite"}
          </ThemedText>
          <ThemedText type="body" themeColor="textSecondary" style={styles.center}>
            Join to share bills, savings goals, and weekly spending together.
          </ThemedText>

          <View style={styles.welcomeList}>
            {pendingInvites.map((inv) => (
              <InviteRow
                key={inv.member_id}
                invite={inv}
                busy={busy}
                onAccept={() => accept.mutate(inv.member_id)}
                onDecline={() => decline.mutate(inv.member_id)}
              />
            ))}
          </View>

          <Button
            title="Create my own household instead"
            variant="secondary"
            onPress={() => setCreateOpen(true)}
            disabled={busy}
          />
        </View>
      </SafeAreaView>

      <CreateHouseholdSheet visible={createOpen} onClose={() => setCreateOpen(false)} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  intro: { marginBottom: Spacing.three },
  row: { marginBottom: Spacing.three },
  rowSub: { marginTop: Spacing.one },
  rowActions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three },
  // Welcome (full-screen) layout.
  fill: { flex: 1 },
  welcomeBody: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.five,
    gap: Spacing.three,
  },
  badge: {
    alignSelf: 'center',
    width: 96,
    height: 96,
    borderRadius: Radius.pill,
    backgroundColor: Palette.sand,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  center: { textAlign: 'center' },
  welcomeList: { marginTop: Spacing.two },
});
