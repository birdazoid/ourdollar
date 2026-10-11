import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { WelcomeIllustration } from '@/components/illustrations/welcome';
import { TextField } from '@/components/inputs';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { DismissKeyboard } from '@/components/dismiss-keyboard';
import { Palette, Spacing } from '@/constants/theme';
import { useHousehold } from '@/lib/household';
import { useCreateHousehold } from '@/lib/queries';

/**
 * Empty state for an account with a profile but no households yet: name the
 * household, right here, and go.
 *
 * It used to be a "Let's set up your household" screen whose only button
 * opened a sheet to type the name, after a "Set up your profile" screen and
 * before a "Let's set up your budget" screen. Three introductions in a row
 * read as the same step repeating. Inviting people now happens in the setup
 * guide's first step, where it sits with the rest of the household.
 */
export function FirstHousehold() {
  const { setActiveHousehold } = useHousehold();
  const create = useCreateHousehold();
  const [name, setName] = useState('');
  const valid = name.trim() !== '';

  function submit() {
    // Return on the keyboard and the button can both fire; one household only.
    if (!valid || create.isPending) return;
    create.mutate(
      { householdName: name.trim(), inviteEmails: [] },
      { onSuccess: (id) => setActiveHousehold(id) }
    );
  }

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <DismissKeyboard>
          <KeyboardAvoidingView
            style={styles.fill}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.body}>
              <WelcomeIllustration width={150} height={134} style={styles.art} />
              <ThemedText type="title" style={styles.center}>
                Name your household
              </ThemedText>
              <ThemedText type="body" themeColor="textSecondary" style={styles.center}>
                Your household holds your income, bills and weekly spending. Next, a few quick
                questions work out how much you have to spend each week.
              </ThemedText>
              <TextField
                placeholder="e.g. The Smiths, Home"
                value={name}
                onChangeText={setName}
                onSubmitEditing={submit}
                returnKeyType="go"
                style={styles.field}
              />
              {create.isError && (
                <ThemedText type="small" style={styles.error}>
                  Couldn&apos;t create the household. Please try again.
                </ThemedText>
              )}
              <Button
                title={valid ? 'Continue' : 'Name your household'}
                disabled={!valid}
                loading={create.isPending}
                onPress={submit}
                style={styles.cta}
              />
            </View>
          </KeyboardAvoidingView>
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
  art: { alignSelf: 'center', marginBottom: Spacing.two },
  center: { textAlign: 'center' },
  field: { marginTop: Spacing.two },
  error: { color: Palette.terracottaDeep, textAlign: 'center' },
  cta: { alignSelf: 'stretch' },
});
