import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AvatarGlyph } from '@/components/avatar-glyph';
import { Button } from '@/components/button';
import { FieldLabel, TextField } from '@/components/inputs';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { DismissKeyboard } from '@/components/dismiss-keyboard';
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

  // Starts empty. It used to be pre-filled from the email address, which put
  // things like "Ourdollar-review-newuser" in the box, and typing added to it
  // instead of replacing it.
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<string>(AVATAR_OPTIONS[0]);

  const valid = name.trim() !== '';

  function save() {
    if (!valid) return;
    updateProfile.mutate({ name: name.trim(), avatar });
  }

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <DismissKeyboard>
          <View style={styles.body}>
            <View style={styles.badge}>
              <AvatarGlyph value={avatar} size={96} />
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
                    onPress={() => {
                      Keyboard.dismiss();
                      setAvatar(a);
                    }}
                    style={[styles.avatarOption, a === avatar && styles.avatarSelected]}>
                    {/* 40 inside a 44 frame with a 2pt border, so the selected ring stays visible. */}
                    <AvatarGlyph value={a} size={40} />
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
        </DismissKeyboard>
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
    overflow: 'hidden',
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
    overflow: 'hidden',
  },
  avatarSelected: { borderColor: Palette.sageDeep, backgroundColor: 'rgba(129,178,154,0.16)' },
  err: { textAlign: 'center' },
  cta: { alignSelf: 'stretch', marginTop: Spacing.two },
});
