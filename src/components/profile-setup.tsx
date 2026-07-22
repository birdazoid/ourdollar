import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { FieldLabel, TextField } from '@/components/inputs';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { AVATAR_OPTIONS } from '@/lib/categories';
import { useUpdateProfile } from '@/lib/queries';

/**
 * First-run profile setup. A user's name + avatar belong to their ACCOUNT (set
 * once here), then reused whenever they create or join a household. Shown by the
 * gate whenever the signed-in account has no name yet.
 */
export function ProfileSetup() {
  const { session } = useSession();
  const updateProfile = useUpdateProfile(session?.user.id ?? null);

  const emailLocal = session?.user.email?.split('@')[0] ?? '';
  const defaultName = emailLocal ? emailLocal.charAt(0).toUpperCase() + emailLocal.slice(1) : '';

  const [name, setName] = useState(defaultName);
  const [avatar, setAvatar] = useState<string>(AVATAR_OPTIONS[0]);

  const valid = name.trim() !== '';

  function save() {
    if (!valid) return;
    updateProfile.mutate({ name: name.trim(), avatar });
  }

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <View style={styles.body}>
          <View style={styles.badge}>
            <ThemedText type="display">{avatar}</ThemedText>
          </View>
          <ThemedText type="title" style={styles.heading}>
            Set up your profile
          </ThemedText>
          <ThemedText type="body" themeColor="textSecondary" style={styles.sub}>
            This is how you&apos;ll show up in any household you create or join. You can change it
            anytime.
          </ThemedText>

          <View style={styles.form}>
            <FieldLabel>Your name</FieldLabel>
            <TextField placeholder="Your name" value={name} onChangeText={setName} />

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
          </View>

          {updateProfile.isError && (
            <ThemedText type="small" themeColor="warningDeep" style={styles.err}>
              Couldn&apos;t save your profile. Please try again.
            </ThemedText>
          )}

          <Button
            title="Continue"
            disabled={!valid}
            loading={updateProfile.isPending}
            onPress={save}
            style={styles.cta}
          />
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: {
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
    backgroundColor: Palette.sage,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  heading: { textAlign: 'center' },
  sub: { textAlign: 'center' },
  form: { alignSelf: 'stretch', marginTop: Spacing.two },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
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
  err: { textAlign: 'center' },
  cta: { alignSelf: 'stretch', marginTop: Spacing.two },
});
