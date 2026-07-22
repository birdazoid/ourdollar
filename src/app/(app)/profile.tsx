import { useRouter } from 'expo-router';
import { Bell, Camera, Check, ChevronLeft, Home, LogOut, Mail, MoreHorizontal, Pencil, Plus, Trash2, X } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddMemberSheet } from '@/components/add-member-sheet';
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
import { AVATAR_OPTIONS } from '@/lib/categories';
import { useHousehold } from '@/lib/household';
import { householdColor, HOUSEHOLD_COLORS } from '@/lib/household-color';
import {
  deleteAccount,
  sendInvite,
  useAccount,
  useMemberMutations,
  useMemberRoleActions,
  useMembers,
  useSetMarketingOptIn,
  useUpdateHousehold,
  useUpdateProfile,
  type NewMemberInput,
} from '@/lib/queries';
import type { Household, HouseholdMember } from '@/lib/types';

export default function ProfileScreen() {
  const router = useRouter();
  const { session, signOut } = useSession();
  const { householdId, household, households, setActiveHousehold } = useHousehold();
  const account = useAccount(session?.user.id ?? null);
  const marketingMut = useSetMarketingOptIn(session?.user.id ?? null);
  const members = useMembers(householdId);
  const memberMut = useMemberMutations(householdId);
  const roleActions = useMemberRoleActions(householdId);
  const updateProfile = useUpdateProfile(session?.user.id ?? null);
  const updateHousehold = useUpdateHousehold();

  const me = (members.data ?? []).find((m) => m.account_id === session?.user.id) ?? null;
  const iAmOwner = !!household && household.owner_account_id === session?.user.id;
  const iAmAdmin = me?.is_admin ?? false; // the owner is always an admin
  const allMembers = members.data ?? [];
  const pendingMembers = allMembers.filter((m) => m.approval_pending);
  const activeMembers = allMembers.filter((m) => !m.approval_pending);
  const memberById = (id: string | null) => allMembers.find((m) => m.id === id) ?? null;
  const roleLabel = (m: HouseholdMember) => {
    if (household && m.account_id === household.owner_account_id) return 'Owner';
    if (m.is_admin) return 'Admin';
    if (m.invite_pending) return `Invited · ${m.invite_email ?? ''}`;
    if (m.has_account) return 'Member';
    return 'Fun money only';
  };

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

  function startEdit() {
    setName(me?.name ?? '');
    setEditing(true);
  }
  function saveEdit() {
    // Profile = account-level name + avatar only. Household names are renamed
    // per-card below.
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

  const loading = !householdId || members.isLoading;

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn} accessibilityLabel="Back">
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
            {/* Identity */}
            <Card style={styles.identity}>
              <Pressable accessibilityRole="button" accessibilityLabel="Change avatar" onPress={() => setPickingAvatar((v) => !v)} style={styles.avatarWrap}>
                <View style={styles.avatar}>
                  <ThemedText type="display">{me?.avatar ?? '🙂'}</ThemedText>
                </View>
                <View style={styles.cameraBadge}>
                  <Camera size={13} color={Palette.card} />
                </View>
              </Pressable>

              {editing ? (
                <View style={styles.editForm}>
                  <TextField placeholder="Your name" value={name} onChangeText={setName} style={styles.editInput} />
                  <Pressable accessibilityRole="button" onPress={saveEdit} style={styles.saveBtn}>
                    <ThemedText type="label" style={styles.saveText}>
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

              {pickingAvatar && (
                <View style={styles.avatarGrid}>
                  {AVATAR_OPTIONS.map((a) => (
                    <Pressable key={a} accessibilityRole="button" accessibilityLabel={`Avatar ${a}`} onPress={() => pickAvatar(a)} style={styles.avatarOption}>
                      <ThemedText type="subtitle">{a}</ThemedText>
                    </Pressable>
                  ))}
                </View>
              )}
            </Card>

            {/* Household switcher */}
            <Eyebrow>Your households</Eyebrow>
            {households.map((h) => {
              const active = h.id === householdId;
              const owner = h.owner_account_id === session?.user.id;
              const color = householdColor(h);
              return (
                <Card key={h.id} style={styles.switchRow}>
                  <View style={[styles.settingIcon, { backgroundColor: color.tint }]}>
                    <Home size={18} color={color.dot} />
                  </View>
                  <View style={styles.flex}>
                    <ThemedText type="bodyBold">{h.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {active ? 'Active' : owner ? 'Owner' : 'Member'}
                    </ThemedText>
                  </View>
                  <View style={styles.cardActions}>
                    {owner && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Rename ${h.name}`}
                        hitSlop={6}
                        onPress={() => openRename(h)}
                        style={styles.iconBtnSm}>
                        <Pencil size={15} color={Palette.ink} />
                      </Pressable>
                    )}
                    {active ? (
                      <View style={styles.activeBadge}>
                        <Check size={16} color={Palette.sageDeep} />
                        <ThemedText type="small" style={styles.activeText}>
                          Active
                        </ThemedText>
                      </View>
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Switch to ${h.name}`}
                        onPress={() => setActiveHousehold(h.id)}
                        style={styles.switchBtn}>
                        <ThemedText type="label" style={styles.switchText}>
                          Switch
                        </ThemedText>
                      </Pressable>
                    )}
                  </View>
                </Card>
              );
            })}
            <DashedAdd label="Create a new household" onPress={() => setCreatingHousehold(true)} />

            {/* Pending approvals (owner/admin only) */}
            {iAmAdmin && pendingMembers.length > 0 && (
              <>
                <Eyebrow>Pending approval</Eyebrow>
                {pendingMembers.map((m) => {
                  const addedBy = memberById(m.added_by_member_id);
                  return (
                    <Card key={m.id} style={styles.memberRow}>
                      <View style={styles.memberAvatar}>
                        <ThemedText type="body">{m.avatar ?? '🙂'}</ThemedText>
                      </View>
                      <View style={styles.flex}>
                        <ThemedText type="bodyBold">{m.invite_email ?? m.name}</ThemedText>
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
                          <ThemedText type="label" style={styles.saveText}>
                            Approve
                          </ThemedText>
                        </Pressable>
                      </View>
                    </Card>
                  );
                })}
              </>
            )}

            {/* Members of the active household */}
            <Eyebrow>Members</Eyebrow>
            {activeMembers.map((m) => {
              const isMe = m.account_id === session?.user.id;
              const isOwnerRow = !!household && m.account_id === household.owner_account_id;
              const elevated = isOwnerRow || m.is_admin;
              const canManage =
                (iAmOwner && !isOwnerRow) ||
                (iAmAdmin && !isOwnerRow && !isMe) ||
                (isMe && !isOwnerRow);
              return (
                <Card key={m.id} style={styles.memberRow}>
                  <View style={styles.memberAvatar}>
                    <ThemedText type="body">{m.avatar ?? '🙂'}</ThemedText>
                  </View>
                  <View style={styles.flex}>
                    <ThemedText type="bodyBold">
                      {m.name}
                      {isMe ? ' (you)' : ''}
                    </ThemedText>
                    <ThemedText
                      type="small"
                      style={{ color: elevated ? Palette.sageDeep : undefined }}
                      themeColor={elevated ? undefined : 'textSecondary'}>
                      {roleLabel(m)}
                    </ThemedText>
                  </View>
                  {canManage && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Manage ${m.name}`}
                      hitSlop={6}
                      onPress={() => setMemberActions(m)}
                      style={styles.iconBtnSm}>
                      <MoreHorizontal size={18} color={Palette.ink} />
                    </Pressable>
                  )}
                </Card>
              );
            })}
            <DashedAdd label="Add a household member" onPress={() => setAddingMember(true)} />

            {/* Notifications */}
            <Eyebrow>Notifications</Eyebrow>
            <ToggleRow
              icon={<Bell size={18} color={Palette.ink} />}
              title="Spend alerts"
              subtitle="When a housemate logs an expense"
              value={me?.notify_on_spend ?? true}
              onToggle={() => me && memberMut.update.mutate({ id: me.id, notify_on_spend: !(me.notify_on_spend ?? true) })}
            />
            <ToggleRow
              icon={<Bell size={18} color={Palette.ink} />}
              title="Bill due reminders"
              subtitle="A nudge the day before"
              value={reminders.due}
              onToggle={() => setReminders((r) => ({ ...r, due: !r.due }))}
            />
            <ToggleRow
              icon={<Bell size={18} color={Palette.ink} />}
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

            {/* Account */}
            <Eyebrow>Account</Eyebrow>
            <SettingRow
              icon={<LogOut size={18} color={Palette.terracottaDeep} />}
              tint="rgba(224,122,95,0.14)"
              title="Sign out"
              onPress={signOut}
            />
            <SettingRow
              icon={<Trash2 size={18} color={Palette.terracottaDeep} />}
              tint="rgba(224,122,95,0.14)"
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
          <ThemedText type="bodyBold" style={styles.saveText}>
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
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />

      {deletingAccount && (
        <View style={styles.deletingOverlay}>
          <ActivityIndicator color={Palette.card} />
          <ThemedText type="bodyBold" style={styles.deletingText}>
            Deleting your account…
          </ThemedText>
        </View>
      )}
    </ThemedView>
  );
}

function Eyebrow({ children }: { children: string }) {
  return (
    <ThemedText type="label" themeColor="textSecondary" style={styles.eyebrow}>
      {children.toUpperCase()}
    </ThemedText>
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
    <Card style={styles.settingRow}>
      <View style={styles.settingIcon}>{icon}</View>
      <View style={styles.flex}>
        <ThemedText type="bodyBold">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {subtitle}
        </ThemedText>
      </View>
      <Switch value={value} onValueChange={onToggle} accessibilityLabel={title} />
    </Card>
  );
}

function SettingRow({
  icon,
  tint,
  title,
  subtitle,
  onPress,
}: {
  icon: ReactNode;
  tint: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress}>
      <Card style={styles.settingRow}>
        <View style={[styles.settingIcon, { backgroundColor: tint }]}>{icon}</View>
        <View style={styles.flex}>
          <ThemedText type="bodyBold">{title}</ThemedText>
          {subtitle && (
            <ThemedText type="small" themeColor="textSecondary">
              {subtitle}
            </ThemedText>
          )}
        </View>
      </Card>
    </Pressable>
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
  deletingText: { color: Palette.card },
  loading: { marginTop: Spacing.six },
  body: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six },
  flex: { flex: 1 },
  identity: { alignItems: 'center', paddingVertical: Spacing.four },
  avatarWrap: { marginBottom: Spacing.two },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: Radius.pill,
    backgroundColor: Palette.sage,
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
    borderColor: Palette.card,
  },
  editForm: { alignSelf: 'stretch', gap: Spacing.two, marginTop: Spacing.two },
  editInput: {
    textAlign: 'center',
    backgroundColor: Palette.linen,
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
  saveText: { color: Palette.card },
  editBtn: {
    marginTop: Spacing.three,
    backgroundColor: 'rgba(129,178,154,0.16)',
    borderRadius: Radius.medium,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.four,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.two,
    marginTop: Spacing.three,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(61,64,91,0.15)',
  },
  avatarOption: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    backgroundColor: Palette.linen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: { marginTop: Spacing.four, marginBottom: Spacing.two, letterSpacing: 0.6 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginBottom: Spacing.two },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  iconBtnSm: {
    width: 34,
    height: 34,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(61,64,91,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchBtn: {
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(129,178,154,0.18)',
  },
  switchText: { color: Palette.sageDeep },
  activeBadge: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  activeText: { color: Palette.sageDeep },
  approveBtn: {
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    backgroundColor: Palette.sageDeep,
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
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginBottom: Spacing.two },
  memberAvatar: {
    width: 38,
    height: 38,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(129,178,154,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtn: { padding: Spacing.one },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginBottom: Spacing.two },
  settingIcon: {
    width: 38,
    height: 38,
    borderRadius: Radius.medium,
    backgroundColor: 'rgba(61,64,91,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
    marginTop: Spacing.one,
  },
  plusBadge: {
    width: 26,
    height: 26,
    borderRadius: Radius.pill,
    backgroundColor: Palette.sageDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
