import { useRouter } from 'expo-router';
import { Bell, Camera, Check, ChevronLeft, Compass, Home, LogOut, Plus, X } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddMemberSheet } from '@/components/add-member-sheet';
import { Card } from '@/components/card';
import { ConfirmDialog, type ConfirmState } from '@/components/confirm-dialog';
import { CreateHouseholdSheet } from '@/components/create-household-sheet';
import { TextField } from '@/components/inputs';
import { Switch } from '@/components/switch';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { AVATAR_OPTIONS } from '@/lib/categories';
import { useHousehold } from '@/lib/household';
import { useHouseholdMutations, useMemberMutations, useMembers, type NewMemberInput } from '@/lib/queries';
import type { HouseholdMember } from '@/lib/types';

export default function ProfileScreen() {
  const router = useRouter();
  const { session, signOut } = useSession();
  const { householdId, household, households, setActiveHousehold } = useHousehold();
  const members = useMembers(householdId);
  const householdMut = useHouseholdMutations(householdId);
  const memberMut = useMemberMutations(householdId);

  const me = (members.data ?? []).find((m) => m.account_id === session?.user.id) ?? null;

  const [pickingAvatar, setPickingAvatar] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [creatingHousehold, setCreatingHousehold] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [reminders, setReminders] = useState({ due: true, overdue: true, weekClose: false });

  function startEdit() {
    setName(me?.name ?? '');
    setHouseholdName(household?.name ?? '');
    setEditing(true);
  }
  function saveEdit() {
    if (me && name.trim()) memberMut.update.mutate({ id: me.id, name: name.trim() });
    if (household && householdName.trim()) householdMut.rename.mutate(householdName.trim());
    setEditing(false);
  }
  function pickAvatar(a: string) {
    if (me) memberMut.update.mutate({ id: me.id, avatar: a });
    setPickingAvatar(false);
  }
  function addMember(input: NewMemberInput) {
    memberMut.add.mutate(input);
    setAddingMember(false);
  }
  function askRemove(m: HouseholdMember) {
    setConfirm({
      title: 'Remove this member?',
      message: `${m.name} will lose access and their fun money stash will be removed. This can't be undone.`,
      confirmLabel: 'Remove',
      onConfirm: () => memberMut.remove.mutate(m.id),
    });
  }

  const statusFor = (m: HouseholdMember) => {
    if (m.is_admin) return 'Admin';
    if (m.invite_pending) return `Invite sent · ${m.invite_email ?? ''}`;
    if (m.has_account) return 'Member';
    return 'No account · fun money only';
  };

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
                  <TextField
                    placeholder="Household name"
                    value={householdName}
                    onChangeText={setHouseholdName}
                    style={styles.editInput}
                  />
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
              return (
                <Pressable
                  key={h.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Switch to ${h.name}`}
                  onPress={() => setActiveHousehold(h.id)}>
                  <Card style={styles.switchRow}>
                    <View style={[styles.settingIcon, active && styles.switchIconActive]}>
                      <Home size={18} color={active ? Palette.sageDeep : Palette.ink} />
                    </View>
                    <View style={styles.flex}>
                      <ThemedText type="bodyBold">{h.name}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {active ? 'Active' : 'Tap to switch'}
                      </ThemedText>
                    </View>
                    {active && <Check size={18} color={Palette.sageDeep} />}
                  </Card>
                </Pressable>
              );
            })}
            <DashedAdd label="Create a new household" onPress={() => setCreatingHousehold(true)} />

            {/* Members of the active household */}
            <Eyebrow>Members</Eyebrow>
            {(members.data ?? []).map((m) => {
              const isMe = m.account_id === session?.user.id;
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
                    <ThemedText type="small" style={{ color: m.is_admin ? Palette.sageDeep : undefined }} themeColor={m.is_admin ? undefined : 'textSecondary'}>
                      {statusFor(m)}
                    </ThemedText>
                  </View>
                  {!m.is_admin && me?.is_admin && (
                    <Pressable onPress={() => askRemove(m)} accessibilityLabel={`Remove ${m.name}`} style={styles.removeBtn}>
                      <X size={17} color={Palette.terracotta} />
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

            {/* Account */}
            <Eyebrow>Account</Eyebrow>
            <SettingRow
              icon={<Compass size={18} color={Palette.sageDeep} />}
              tint="rgba(129,178,154,0.16)"
              title="Replay setup guide"
              subtitle="Walk through income, bills & goals again"
              onPress={() => router.push('/onboarding')}
            />
            <SettingRow
              icon={<LogOut size={18} color={Palette.terracottaDeep} />}
              tint="rgba(224,122,95,0.14)"
              title="Sign out"
              onPress={signOut}
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
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
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
  switchIconActive: { backgroundColor: 'rgba(129,178,154,0.16)' },
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
