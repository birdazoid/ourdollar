import { useRouter } from 'expo-router';
import {
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Fingerprint,
  KeyRound,
  Mail,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import IconHousing from '@/assets/icons/icon-housing.svg';
import IconNotifications from '@/assets/icons/icon-notifications.svg';
import IconShare from '@/assets/icons/icon-share.svg';
import IconSignOut from '@/assets/icons/icon-sign-out.svg';
import { AddMemberSheet } from '@/components/add-member-sheet';
import { AvatarGlyph } from '@/components/avatar-glyph';
import { AvatarPickerSheet } from '@/components/avatar-picker-sheet';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ConfirmDialog, type ConfirmState } from '@/components/confirm-dialog';
import { CreateHouseholdSheet } from '@/components/create-household-sheet';
import { FieldLabel, TextField } from '@/components/inputs';
import { Sheet } from '@/components/sheet';
import { Switch } from '@/components/switch';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import {
  authenticateWithBiometrics,
  isBiometricLockEnabled,
  isBiometricSupported,
  setBiometricLockEnabled,
} from '@/lib/biometrics';
import { useHousehold } from '@/lib/household';
import { householdColor, HOUSEHOLD_COLORS } from '@/lib/household-color';
import {
  deleteAccount,
  sendInvite,
  useAccount,
  useAllMembers,
  useMemberMutations,
  useMemberRoleActions,
  useSetMarketingOptIn,
  useUpdateHousehold,
  useUpdateProfile,
  type NewMemberInput,
} from '@/lib/queries';
import type { Household, HouseholdMember } from '@/lib/types';

// Where "Invite friends" points. Update to the App Store link once the app is
// live (ourdollar.app should host the download/landing page in the meantime).
const APP_SHARE_URL = 'https://ourdollar.app';

function roleLabelFor(m: HouseholdMember, h: Household | null | undefined) {
  if (h && m.account_id === h.owner_account_id) return 'Owner';
  if (m.is_admin) return 'Admin';
  if (m.invite_pending) return `Invited · ${m.invite_email ?? ''}`;
  if (m.has_account) return 'Member';
  return 'Fun money only';
}

export default function ProfileScreen() {
  const router = useRouter();
  const { session, signOut, updatePassword, updateEmail, reauthenticate } = useSession();
  const { householdId, household, households, setActiveHousehold } = useHousehold();
  const account = useAccount(session?.user.id ?? null);
  const marketingMut = useSetMarketingOptIn(session?.user.id ?? null);
  const allMembers = useAllMembers();
  const memberMut = useMemberMutations(householdId);
  const roleActions = useMemberRoleActions(householdId);
  const updateProfile = useUpdateProfile(session?.user.id ?? null);
  const updateHousehold = useUpdateHousehold();

  const members = allMembers.data ?? [];
  const activeAll = members.filter((m) => m.household_id === householdId);
  const me = activeAll.find((m) => m.account_id === session?.user.id) ?? null;
  const iAmOwner = !!household && household.owner_account_id === session?.user.id;
  const iAmAdmin = me?.is_admin ?? false; // the owner is always an admin
  const pendingMembers = activeAll.filter((m) => m.approval_pending);
  const activeMembers = activeAll.filter((m) => !m.approval_pending);
  const memberById = (id: string | null) => members.find((m) => m.id === id) ?? null;
  const inactiveHouseholds = households.filter((h) => h.id !== householdId);

  const [pickingAvatar, setPickingAvatar] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<Household | null>(null);
  const [renameText, setRenameText] = useState('');
  const [renameColor, setRenameColor] = useState<string>('sage');
  const [addingMember, setAddingMember] = useState(false);
  const [memberActions, setMemberActions] = useState<HouseholdMember | null>(null);
  const [creatingHousehold, setCreatingHousehold] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [reminders, setReminders] = useState({ due: true, overdue: true, weekClose: false });
  const [expanded, setExpanded] = useState<string[]>([]);

  // Security: change password, change email, biometric app-lock toggle.
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPasswordForPw, setCurrentPasswordForPw] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);
  const [changingEmail, setChangingEmail] = useState(false);
  const [currentPasswordForEmail, setCurrentPasswordForEmail] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    if (!session) return;
    isBiometricSupported().then(setBiometricSupported);
    isBiometricLockEnabled(session.user.id).then(setBiometricEnabled);
  }, [session]);

  async function toggleBiometric() {
    if (!session) return;
    if (biometricEnabled) {
      await setBiometricLockEnabled(session.user.id, false);
      setBiometricEnabled(false);
      return;
    }
    const supported = await isBiometricSupported();
    setBiometricSupported(supported);
    if (!supported) {
      Alert.alert('Not available', 'Face ID or Touch ID isn’t set up on this device.');
      return;
    }
    const ok = await authenticateWithBiometrics('Confirm to enable Face ID unlock');
    if (!ok) return;
    await setBiometricLockEnabled(session.user.id, true);
    setBiometricEnabled(true);
  }

  function openChangePassword() {
    setCurrentPasswordForPw('');
    setNewPassword('');
    setNewPasswordConfirm('');
    setPasswordError(null);
    setChangingPassword(true);
  }
  async function saveNewPassword() {
    setPasswordError(null);
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setPasswordError('New passwords don’t match.');
      return;
    }
    setSavingPassword(true);
    const reauth = await reauthenticate(currentPasswordForPw);
    if (reauth.error) {
      setSavingPassword(false);
      setPasswordError('Current password is incorrect.');
      return;
    }
    const { error } = await updatePassword(newPassword);
    setSavingPassword(false);
    if (error) {
      setPasswordError(error.message);
      return;
    }
    setChangingPassword(false);
  }

  function openChangeEmail() {
    setCurrentPasswordForEmail('');
    setNewEmail('');
    setEmailError(null);
    setEmailSent(false);
    setChangingEmail(true);
  }
  async function saveNewEmail() {
    setEmailError(null);
    if (!newEmail.trim() || !newEmail.includes('@')) {
      setEmailError('Enter a valid email address.');
      return;
    }
    setSavingEmail(true);
    const reauth = await reauthenticate(currentPasswordForEmail);
    if (reauth.error) {
      setSavingEmail(false);
      setEmailError('Current password is incorrect.');
      return;
    }
    const { error } = await updateEmail(newEmail.trim());
    setSavingEmail(false);
    if (error) {
      setEmailError(error.message);
      return;
    }
    setEmailSent(true);
  }

  const toggleExpand = (id: string) =>
    setExpanded((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  function startEdit() {
    setName(me?.name ?? '');
    setEditing(true);
  }
  function saveEdit() {
    if (name.trim()) updateProfile.mutate({ name: name.trim() });
    setEditing(false);
  }
  function openRename(h: Household) {
    setRenaming(h);
    setRenameText(h.name);
    setRenameColor(householdColor(h).key);
  }
  function saveRename() {
    if (renaming && renameText.trim()) {
      updateHousehold.mutate({ id: renaming.id, name: renameText.trim(), color: renameColor });
    }
    setRenaming(null);
  }
  function pickAvatar(a: string) {
    updateProfile.mutate({ avatar: a });
    setPickingAvatar(false);
  }
  function addMember(input: NewMemberInput) {
    // Non-owner/admin adds are held for approval, and the invite email waits.
    const pending = !iAmAdmin;
    memberMut.add.mutate(
      { ...input, approvalPending: pending },
      {
        onSuccess: (memberId) => {
          if (input.inviteEmail && !pending) sendInvite(memberId).catch(() => {});
        },
      }
    );
    setAddingMember(false);
  }
  function askRemove(m: HouseholdMember) {
    setMemberActions(null);
    const self = m.account_id === session?.user.id;
    setConfirm({
      title: self ? 'Leave this household?' : 'Remove this member?',
      message: self
        ? `You'll lose access to ${household?.name ?? 'this household'}. You can be re-invited later.`
        : `${m.name} will lose access and their fun money stash will be removed. This can't be undone.`,
      confirmLabel: self ? 'Leave' : 'Remove',
      onConfirm: () => memberMut.remove.mutate(m.id),
    });
  }
  function askTransfer(m: HouseholdMember) {
    setMemberActions(null);
    setConfirm({
      title: `Make ${m.name} the owner?`,
      message: `${m.name} will become the household owner. You'll stay on as an admin, but only the new owner can transfer ownership or manage admins.`,
      confirmLabel: 'Transfer',
      onConfirm: () => roleActions.transfer.mutate(m.id),
    });
  }
  function toggleAdmin(m: HouseholdMember) {
    setMemberActions(null);
    roleActions.setAdmin.mutate({ memberId: m.id, isAdmin: !m.is_admin });
  }
  function resendInvite(m: HouseholdMember) {
    setMemberActions(null);
    sendInvite(m.id)
      .then(() => Alert.alert('Invite sent', `We re-sent the invite to ${m.invite_email ?? m.name}.`))
      .catch(() =>
        Alert.alert(
          "Couldn't send the invite",
          'The invite email failed to go out. Check your email setup and try again.'
        )
      );
  }
  // Refer a friend to the app (no household involved) — opens the OS share sheet.
  async function shareApp() {
    try {
      await Share.share({
        message: `I'm using OurDollar to budget with my household — give it a try: ${APP_SHARE_URL}`,
      });
    } catch {
      // user dismissed the share sheet — nothing to do
    }
  }
  function askDeleteAccount() {
    setConfirm({
      title: 'Delete your account?',
      message:
        'This permanently deletes your account and any households you own — every bill, goal, income, and all history. This cannot be undone.',
      confirmLabel: 'Delete account',
      onConfirm: async () => {
        try {
          setDeletingAccount(true);
          await deleteAccount();
          await signOut();
        } catch {
          setDeletingAccount(false);
          Alert.alert('Could not delete account', 'Something went wrong. Please try again.');
        }
      },
    });
  }

  const activeColor = household ? householdColor(household) : null;
  const loading = !householdId || allMembers.isLoading;

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/week'))}
            style={styles.iconBtn}
            accessibilityLabel="Back">
            <ChevronLeft size={20} color={Palette.ink} />
          </Pressable>
          <ThemedText type="subtitle">Profile</ThemedText>
          <View style={styles.headerSpacer} />
        </View>

        {loading ? (
          <ActivityIndicator color={Palette.sageDeep} style={styles.loading} />
        ) : (
          <ScrollView
            style={styles.fill}
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}>
            {/* Identity — no card, sits on the linen background */}
            <View style={styles.identity}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Change avatar"
                onPress={() => setPickingAvatar(true)}
                style={styles.avatarWrap}>
                <View style={styles.avatar}>
                  <AvatarGlyph value={me?.avatar} size={84} />
                </View>
                <View style={styles.cameraBadge}>
                  <Camera size={13} color={Palette.card} />
                </View>
              </Pressable>

              {editing ? (
                <View style={styles.editForm}>
                  <TextField placeholder="Your name" value={name} onChangeText={setName} style={styles.editInput} />
                  <Pressable accessibilityRole="button" onPress={saveEdit} style={styles.saveBtn}>
                    <ThemedText type="label" style={styles.onDark}>
                      Save
                    </ThemedText>
                  </Pressable>
                </View>
              ) : (
                <>
                  <ThemedText type="title">{me?.name ?? 'You'}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {household?.name ?? 'The Household'}
                  </ThemedText>
                  <Pressable accessibilityRole="button" onPress={startEdit} style={styles.editBtn}>
                    <ThemedText type="label" style={{ color: Palette.sageDeep }}>
                      Edit profile
                    </ThemedText>
                  </Pressable>
                </>
              )}
            </View>

            {/* Households — active shown as a card with its members inside */}
            <Eyebrow>Your households</Eyebrow>
            {household && activeColor && (
              <Card style={styles.activeCard}>
                <View style={styles.hhHeader}>
                  <View style={styles.hhTile}>
                    <IconHousing width={25} height={25} color={activeColor.dot} />
                  </View>
                  <View style={styles.flex}>
                    <ThemedText type="bodyBold">{household.name}</ThemedText>
                    <ThemedText type="small" style={styles.activeText}>
                      Active household
                    </ThemedText>
                  </View>
                  {iAmOwner && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${household.name}`}
                      hitSlop={6}
                      onPress={() => openRename(household)}
                      style={styles.iconBtnSm}>
                      <Pencil size={15} color={Palette.ink} />
                    </Pressable>
                  )}
                </View>

                {iAmAdmin && pendingMembers.length > 0 && (
                  <View style={styles.hhSection}>
                    <SectionLabel>Pending approval</SectionLabel>
                    {pendingMembers.map((m) => {
                      const addedBy = memberById(m.added_by_member_id);
                      return (
                        <View key={m.id} style={styles.memberRow}>
                          <View style={styles.memberAvatar}>
                            <AvatarGlyph value={m.avatar} size={38} />
                          </View>
                          <View style={styles.flex}>
                            <ThemedText type="bodyBold" numberOfLines={1}>
                              {m.invite_email ?? m.name}
                            </ThemedText>
                            <ThemedText type="small" themeColor="textSecondary">
                              {addedBy ? `Added by ${addedBy.name}` : 'Awaiting approval'}
                            </ThemedText>
                          </View>
                          <View style={styles.cardActions}>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Reject ${m.name}`}
                              hitSlop={6}
                              onPress={() => memberMut.remove.mutate(m.id)}
                              style={styles.iconBtnSm}>
                              <X size={16} color={Palette.terracotta} />
                            </Pressable>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Approve ${m.name}`}
                              onPress={() => roleActions.approve.mutate(m.id)}
                              style={styles.approveBtn}>
                              <ThemedText type="label" style={styles.onDark}>
                                Approve
                              </ThemedText>
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}

                <View style={styles.hhSection}>
                  {activeMembers.map((m) => {
                    const isMe = m.account_id === session?.user.id;
                    const isOwnerRow = household.owner_account_id === m.account_id;
                    const canManage =
                      (iAmOwner && !isOwnerRow) ||
                      (iAmAdmin && !isOwnerRow && !isMe) ||
                      (isMe && !isOwnerRow);
                    return (
                      <MemberRow
                        key={m.id}
                        member={m}
                        role={roleLabelFor(m, household)}
                        elevated={isOwnerRow || m.is_admin}
                        isMe={isMe}
                        onActions={canManage ? () => setMemberActions(m) : undefined}
                      />
                    );
                  })}
                </View>

                <DashedAdd label="Add a household member" onPress={() => setAddingMember(true)} />
              </Card>
            )}

            {/* Inactive households — borderless accordions, expand to show members */}
            {inactiveHouseholds.map((h) => {
              const c = householdColor(h);
              const isOpen = expanded.includes(h.id);
              const hMembers = members.filter((m) => m.household_id === h.id && !m.approval_pending);
              const ownerOfH = h.owner_account_id === session?.user.id;
              return (
                <View key={h.id} style={styles.inactiveWrap}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isOpen }}
                    accessibilityLabel={`${h.name}, ${isOpen ? 'collapse' : 'expand'}`}
                    onPress={() => toggleExpand(h.id)}
                    style={styles.inactiveHeader}>
                    <View style={[styles.inactiveDot, { backgroundColor: c.dot }]} />
                    <View style={styles.flex}>
                      <ThemedText type="bodyBold">{h.name}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {hMembers.length} {hMembers.length === 1 ? 'member' : 'members'} ·{' '}
                        {ownerOfH ? 'Owner' : 'Member'}
                      </ThemedText>
                    </View>
                    {isOpen ? (
                      <ChevronUp size={18} color="#B7B8C4" />
                    ) : (
                      <ChevronDown size={18} color="#B7B8C4" />
                    )}
                  </Pressable>
                  {isOpen && (
                    <View style={styles.inactiveBody}>
                      {hMembers.map((m) => (
                        <MemberRow
                          key={m.id}
                          member={m}
                          role={roleLabelFor(m, h)}
                          elevated={h.owner_account_id === m.account_id || m.is_admin}
                          isMe={m.account_id === session?.user.id}
                        />
                      ))}
                      <Button
                        title="Switch to this household"
                        onPress={() => setActiveHousehold(h.id)}
                        style={styles.switchFull}
                      />
                      {ownerOfH && (
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => openRename(h)}
                          style={styles.inactiveEdit}>
                          <ThemedText type="label" style={{ color: Palette.sageDeep }}>
                            Edit name &amp; color
                          </ThemedText>
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
            <DashedAdd label="Create a new household" onPress={() => setCreatingHousehold(true)} />

            {/* Notifications — flat rows, no cards */}
            <Eyebrow>Notifications</Eyebrow>
            <ToggleRow
              icon={<IconNotifications width={21} height={21} color={Palette.ink} />}
              title="Spend alerts"
              subtitle="When a housemate logs an expense"
              value={me?.notify_on_spend ?? true}
              onToggle={() => me && memberMut.update.mutate({ id: me.id, notify_on_spend: !(me.notify_on_spend ?? true) })}
            />
            <ToggleRow
              icon={<IconNotifications width={21} height={21} color={Palette.ink} />}
              title="Bill due reminders"
              subtitle="A nudge the day before"
              value={reminders.due}
              onToggle={() => setReminders((r) => ({ ...r, due: !r.due }))}
            />
            <ToggleRow
              icon={<IconNotifications width={21} height={21} color={Palette.ink} />}
              title="Overdue alerts"
              subtitle="If a bill slips past its date"
              value={reminders.overdue}
              onToggle={() => setReminders((r) => ({ ...r, overdue: !r.overdue }))}
            />
            <ToggleRow
              icon={<Mail size={18} color={Palette.ink} />}
              title="Product updates"
              subtitle="Occasional news & tips by email"
              value={account.data?.marketing_opt_in ?? false}
              onToggle={() => marketingMut.mutate(!(account.data?.marketing_opt_in ?? false))}
            />

            {/* Refer a friend */}
            <Eyebrow>Spread the word</Eyebrow>
            <SettingRow
              icon={<IconShare width={21} height={21} color={Palette.sageDeep} />}
              title="Invite friends to OurDollar"
              subtitle="Share the app with anyone"
              onPress={shareApp}
            />

            {/* Security — flat rows, no cards */}
            <Eyebrow>Security</Eyebrow>
            <SettingRow
              icon={<KeyRound size={18} color={Palette.ink} />}
              title="Change password"
              onPress={openChangePassword}
            />
            <SettingRow
              icon={<Mail size={18} color={Palette.ink} />}
              title="Change email"
              subtitle={session?.user.email ?? undefined}
              onPress={openChangeEmail}
            />
            {biometricSupported && (
              <ToggleRow
                icon={<Fingerprint size={21} color={Palette.ink} />}
                title="Unlock with Face ID"
                subtitle="Require Face ID or Touch ID to open the app"
                value={biometricEnabled}
                onToggle={toggleBiometric}
              />
            )}

            {/* Account — flat rows, no cards */}
            <Eyebrow>Account</Eyebrow>
            <SettingRow
              icon={<IconSignOut width={21} height={21} color={Palette.terracottaDeep} />}
              title="Sign out"
              onPress={signOut}
            />
            <SettingRow
              icon={<Trash2 size={18} color={Palette.terracottaDeep} />}
              title="Delete account"
              subtitle="Permanently erase your account & data"
              onPress={askDeleteAccount}
            />
          </ScrollView>
        )}
      </SafeAreaView>

      <AddMemberSheet
        visible={addingMember}
        onClose={() => setAddingMember(false)}
        onAdd={addMember}
        saving={memberMut.add.isPending}
      />
      <CreateHouseholdSheet
        visible={creatingHousehold}
        onClose={() => setCreatingHousehold(false)}
      />
      <Sheet visible={!!renaming} title="Edit household" onClose={() => setRenaming(null)}>
        <FieldLabel>Household name</FieldLabel>
        <TextField
          placeholder="Household name"
          value={renameText}
          onChangeText={setRenameText}
          autoFocus
        />
        <FieldLabel>Color</FieldLabel>
        <View style={styles.colorRow}>
          {HOUSEHOLD_COLORS.map((c) => (
            <Pressable
              key={c.key}
              accessibilityRole="button"
              accessibilityLabel={`Color ${c.key}`}
              accessibilityState={{ selected: c.key === renameColor }}
              onPress={() => setRenameColor(c.key)}
              style={[
                styles.colorSwatch,
                { backgroundColor: c.tint },
                c.key === renameColor && { borderColor: c.dot },
              ]}>
              <View style={[styles.colorDot, { backgroundColor: c.dot }]} />
            </Pressable>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={saveRename}
          disabled={!renameText.trim()}
          style={[styles.renameSave, !renameText.trim() && styles.renameSaveDisabled]}>
          <ThemedText type="bodyBold" style={styles.onDark}>
            Save
          </ThemedText>
        </Pressable>
      </Sheet>
      <Sheet
        visible={!!memberActions}
        title={memberActions?.name ?? 'Member'}
        onClose={() => setMemberActions(null)}>
        {memberActions &&
          (() => {
            const ma = memberActions;
            const maIsOwner = !!household && ma.account_id === household.owner_account_id;
            const maIsMe = ma.account_id === session?.user.id;
            const maHasAccount = !!ma.account_id;
            return (
              <View>
                {iAmOwner && maHasAccount && !maIsOwner && (
                  <ActionRow
                    label={ma.is_admin ? 'Remove as admin' : 'Make admin (share ownership)'}
                    onPress={() => toggleAdmin(ma)}
                  />
                )}
                {iAmOwner && maHasAccount && !maIsOwner && (
                  <ActionRow label="Transfer ownership" onPress={() => askTransfer(ma)} />
                )}
                {(iAmOwner || iAmAdmin) && ma.invite_pending && !ma.approval_pending && (
                  <ActionRow label="Resend invite" onPress={() => resendInvite(ma)} />
                )}
                {(iAmOwner || iAmAdmin) && !maIsOwner && !maIsMe && (
                  <ActionRow label="Remove from household" danger onPress={() => askRemove(ma)} />
                )}
                {maIsMe && !maIsOwner && (
                  <ActionRow label="Leave household" danger onPress={() => askRemove(ma)} />
                )}
              </View>
            );
          })()}
      </Sheet>
      <Sheet visible={changingPassword} title="Change password" onClose={() => setChangingPassword(false)}>
        <FieldLabel>Current password</FieldLabel>
        <TextField
          placeholder="Current password"
          value={currentPasswordForPw}
          onChangeText={setCurrentPasswordForPw}
          secureTextEntry
          autoFocus
        />
        <FieldLabel>New password</FieldLabel>
        <TextField
          placeholder="New password"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
        />
        <FieldLabel>Confirm new password</FieldLabel>
        <TextField
          placeholder="Confirm new password"
          value={newPasswordConfirm}
          onChangeText={setNewPasswordConfirm}
          secureTextEntry
        />
        {passwordError && (
          <ThemedText type="small" themeColor="warningDeep" style={styles.sheetError}>
            {passwordError}
          </ThemedText>
        )}
        <Button
          title="Save new password"
          onPress={saveNewPassword}
          loading={savingPassword}
          style={styles.sheetSave}
        />
      </Sheet>

      <Sheet visible={changingEmail} title="Change email" onClose={() => setChangingEmail(false)}>
        {emailSent ? (
          <View style={styles.emailSentWrap}>
            <ThemedText type="body">
              We sent a confirmation link to <ThemedText type="bodyBold">{newEmail.trim()}</ThemedText>.
              Tap it to finish changing your email.
            </ThemedText>
            <Button title="Done" onPress={() => setChangingEmail(false)} style={styles.sheetSave} />
          </View>
        ) : (
          <>
            <FieldLabel>Current password</FieldLabel>
            <TextField
              placeholder="Current password"
              value={currentPasswordForEmail}
              onChangeText={setCurrentPasswordForEmail}
              secureTextEntry
              autoFocus
            />
            <FieldLabel>New email</FieldLabel>
            <TextField
              placeholder="New email"
              value={newEmail}
              onChangeText={setNewEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            {emailError && (
              <ThemedText type="small" themeColor="warningDeep" style={styles.sheetError}>
                {emailError}
              </ThemedText>
            )}
            <Button
              title="Send confirmation link"
              onPress={saveNewEmail}
              loading={savingEmail}
              style={styles.sheetSave}
            />
          </>
        )}
      </Sheet>

      <AvatarPickerSheet
        visible={pickingAvatar}
        current={me?.avatar}
        onPick={pickAvatar}
        onClose={() => setPickingAvatar(false)}
      />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />

      {deletingAccount && (
        <View style={styles.deletingOverlay}>
          <ActivityIndicator color={Palette.card} />
          <ThemedText type="bodyBold" style={styles.onDark}>
            Deleting your account…
          </ThemedText>
        </View>
      )}
    </ThemedView>
  );
}

function MemberRow({
  member,
  role,
  elevated,
  isMe,
  onActions,
}: {
  member: HouseholdMember;
  role: string;
  elevated: boolean;
  isMe: boolean;
  onActions?: () => void;
}) {
  return (
    <View style={styles.memberRow}>
      <View style={styles.memberAvatar}>
        <AvatarGlyph value={member.avatar} size={38} />
      </View>
      <View style={styles.flex}>
        <ThemedText type="bodyBold" numberOfLines={1}>
          {member.name}
          {isMe ? ' (you)' : ''}
        </ThemedText>
        <ThemedText
          type="small"
          style={elevated ? { color: Palette.sageDeep } : undefined}
          themeColor={elevated ? undefined : 'textSecondary'}
          numberOfLines={1}>
          {role}
        </ThemedText>
      </View>
      {onActions && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Manage ${member.name}`}
          hitSlop={6}
          onPress={onActions}
          style={styles.iconBtnSm}>
          <MoreHorizontal size={18} color={Palette.ink} />
        </Pressable>
      )}
    </View>
  );
}

function Eyebrow({ children }: { children: string }) {
  return (
    <ThemedText type="label" themeColor="textSecondary" style={styles.eyebrow}>
      {children.toUpperCase()}
    </ThemedText>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
      {children.toUpperCase()}
    </ThemedText>
  );
}

function ActionRow({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.actionRow}>
      <ThemedText type="bodyBold" style={danger ? { color: Palette.terracottaDeep } : undefined}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function ToggleRow({
  icon,
  title,
  subtitle,
  value,
  onToggle,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={styles.flatRow}>
      <View style={styles.settingIcon}>{icon}</View>
      <View style={styles.flex}>
        <ThemedText type="bodyBold">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {subtitle}
        </ThemedText>
      </View>
      <Switch value={value} onValueChange={onToggle} accessibilityLabel={title} />
    </View>
  );
}

function SettingRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={styles.flatRow}>
      <View style={styles.settingIcon}>{icon}</View>
      <View style={styles.flex}>
        <ThemedText type="bodyBold">{title}</ThemedText>
        {subtitle && (
          <ThemedText type="small" themeColor="textSecondary">
            {subtitle}
          </ThemedText>
        )}
      </View>
    </Pressable>
  );
}

function DashedAdd({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.dashedAdd}>
      <View style={styles.plusBadge}>
        <Plus size={16} color={Palette.card} strokeWidth={3} />
      </View>
      <ThemedText type="label">{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  onDark: { color: Palette.card },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    backgroundColor: Palette.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: { width: 40, height: 40 },
  loading: { marginTop: Spacing.six },
  body: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six },

  // Identity (no card)
  identity: { alignItems: 'center', paddingTop: Spacing.two, paddingBottom: Spacing.four },
  avatarWrap: { marginBottom: Spacing.two },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: Radius.pill,
    backgroundColor: Palette.sage,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 2,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    backgroundColor: Palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Palette.linen,
  },
  editForm: { alignSelf: 'stretch', gap: Spacing.two, marginTop: Spacing.two },
  editInput: {
    textAlign: 'center',
    backgroundColor: Palette.card,
    borderWidth: 1.5,
    borderColor: 'rgba(61,64,91,0.18)',
  },
  saveBtn: {
    alignSelf: 'center',
    backgroundColor: Palette.sage,
    borderRadius: Radius.small,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  editBtn: {
    marginTop: Spacing.three,
    backgroundColor: 'rgba(129,178,154,0.16)',
    borderRadius: Radius.medium,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.four,
  },

  eyebrow: { marginTop: Spacing.four, marginBottom: Spacing.two, letterSpacing: 0.6 },

  // Active household card
  activeCard: { padding: Spacing.three, gap: Spacing.three },
  hhHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  hhTile: {
    width: 40,
    height: 40,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeText: { color: Palette.sageDeep },
  hhSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(61,64,91,0.12)',
    paddingTop: Spacing.two,
    gap: Spacing.one,
  },
  sectionLabel: { letterSpacing: 0.6, marginBottom: Spacing.one },

  memberRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.one + 2 },
  memberAvatar: {
    width: 38,
    height: 38,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(129,178,154,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  iconBtnSm: {
    width: 34,
    height: 34,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(61,64,91,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveBtn: {
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    backgroundColor: Palette.sageDeep,
  },

  // Inactive household accordion (no card)
  inactiveWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(61,64,91,0.12)',
  },
  inactiveHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.three },
  inactiveDot: { width: 14, height: 14, borderRadius: Radius.pill },
  inactiveBody: { paddingBottom: Spacing.three, paddingLeft: Spacing.two },
  switchFull: { alignSelf: 'stretch', marginTop: Spacing.two },
  inactiveEdit: { alignSelf: 'center', paddingVertical: Spacing.two, marginTop: Spacing.one },

  // Flat settings rows (no cards)
  flatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(61,64,91,0.1)',
  },
  settingIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Add + sheets
  dashedAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(61,64,91,0.25)',
    borderRadius: Radius.large,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    marginTop: Spacing.three,
  },
  plusBadge: {
    width: 26,
    height: 26,
    borderRadius: Radius.pill,
    backgroundColor: Palette.sageDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRow: {
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(61,64,91,0.08)',
  },
  colorRow: { flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.two },
  colorSwatch: {
    width: 48,
    height: 48,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDot: { width: 20, height: 20, borderRadius: Radius.pill },
  renameSave: {
    marginTop: Spacing.three,
    height: 52,
    borderRadius: Radius.large,
    backgroundColor: Palette.sageDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  renameSaveDisabled: { opacity: 0.5 },
  sheetError: { textAlign: 'center', marginTop: Spacing.two },
  sheetSave: { marginTop: Spacing.four },
  emailSentWrap: { gap: Spacing.three },

  deletingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(61,64,91,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
});
