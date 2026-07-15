import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Palette, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/auth';
import { stashPendingMarketingOptIn } from '@/lib/queries';

type Mode = 'signIn' | 'signUp';

export default function SignInScreen() {
  const theme = useTheme();
  const { signIn, signUp } = useSession();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [marketingOptIn, setMarketingOptIn] = useState(false);

  const isSignIn = mode === 'signIn';

  async function handleSubmit() {
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setLoading(true);
    if (isSignIn) {
      const { error } = await signIn(email.trim(), password);
      if (error) setError(error.message);
      // On success, the session listener flips the app into the protected group.
    } else {
      // Stash the consent choice — it's written to the account on first authed
      // load (there's no session yet when email confirmation is required).
      await stashPendingMarketingOptIn(marketingOptIn);
      const { error, needsConfirmation } = await signUp(email.trim(), password);
      if (error) setError(error.message);
      else if (needsConfirmation) setSentTo(email.trim());
      // If no confirmation needed, the session listener takes over.
    }
    setLoading(false);
  }

  function switchTo(next: Mode) {
    setMode(next);
    setError(null);
  }

  // Dedicated "we sent you a confirmation email" state — clearer than a one-line note.
  if (sentTo) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.content}>
            <View style={styles.header}>
              <ThemedText type="display" style={styles.confirmEmoji}>
                📬
              </ThemedText>
              <ThemedText type="title">Check your inbox</ThemedText>
              <ThemedText type="body" themeColor="textSecondary" style={styles.tagline}>
                We sent a confirmation link to{'\n'}
                <ThemedText type="bodyBold">{sentTo}</ThemedText>
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.tagline}>
                Tap the link in that email to verify your account, then sign in. Check spam if it
                hasn&apos;t arrived in a minute.
              </ThemedText>
            </View>
            <Button
              title="Back to sign in"
              onPress={() => {
                setSentTo(null);
                setPassword('');
                setMode('signIn');
              }}
            />
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}>
          <View style={styles.content}>
            <View style={styles.header}>
              <ThemedText type="display">OurDollar</ThemedText>
              <ThemedText type="body" themeColor="textSecondary" style={styles.tagline}>
                {isSignIn
                  ? 'Sign in to your household.'
                  : 'Shared budgeting for the people you live with.'}
              </ThemedText>
            </View>

            {!isSignIn && (
              <View style={styles.perks}>
                <Perk emoji="🧾" text="Track bills — and who paid what" />
                <Perk emoji="✨" text="Save toward goals together" />
                <Perk emoji="📆" text="A weekly spending number, auto-calculated" />
              </View>
            )}

            <View style={styles.form}>
              <TextInput
                style={[styles.input, { color: theme.text, borderColor: theme.accentDeep }]}
                placeholder="Email"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                inputMode="email"
                value={email}
                onChangeText={setEmail}
                editable={!loading}
              />
              <TextInput
                style={[styles.input, { color: theme.text, borderColor: theme.accentDeep }]}
                placeholder={isSignIn ? 'Password' : 'Create a password'}
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="none"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                editable={!loading}
                onSubmitEditing={handleSubmit}
                returnKeyType="go"
              />

              {!isSignIn && (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: marketingOptIn }}
                  accessibilityLabel="Send me product updates"
                  onPress={() => setMarketingOptIn((v) => !v)}
                  style={styles.optInRow}>
                  <View style={[styles.checkbox, marketingOptIn && styles.checkboxOn]}>
                    {marketingOptIn && <Check size={14} color={Palette.card} strokeWidth={3} />}
                  </View>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
                    Send me occasional product updates &amp; tips. You can turn this off anytime.
                  </ThemedText>
                </Pressable>
              )}

              {error && (
                <ThemedText type="small" themeColor="warningDeep" style={styles.message}>
                  {error}
                </ThemedText>
              )}

              <Button
                title={isSignIn ? 'Sign in' : 'Create account'}
                onPress={handleSubmit}
                loading={loading}
              />
              <Button
                title={isSignIn ? 'New here? Create an account' : 'Already have an account? Sign in'}
                variant="secondary"
                onPress={() => switchTo(isSignIn ? 'signUp' : 'signIn')}
                disabled={loading}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Perk({ emoji, text }: { emoji: string; text: string }) {
  return (
    <View style={styles.perk}>
      <ThemedText type="subtitle">{emoji}</ThemedText>
      <ThemedText type="body" style={styles.perkText}>
        {text}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
  header: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  confirmEmoji: { marginBottom: Spacing.two },
  tagline: { textAlign: 'center' },
  perks: {
    gap: Spacing.three,
    backgroundColor: 'rgba(129,178,154,0.12)',
    borderRadius: Radius.large,
    padding: Spacing.four,
  },
  perk: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  perkText: { flex: 1 },
  form: {
    gap: Spacing.three,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderRadius: Radius.large,
    paddingHorizontal: Spacing.three,
    fontFamily: Fonts.sans.regular,
    fontSize: 16,
    backgroundColor: Palette.card,
  },
  message: {
    textAlign: 'center',
  },
  optInRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: Radius.small,
    borderWidth: 1.5,
    borderColor: 'rgba(61,64,91,0.3)',
    backgroundColor: Palette.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: Palette.sageDeep, borderColor: Palette.sageDeep },
});
