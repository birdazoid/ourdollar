import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Palette, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/auth';

export default function ForgotPasswordScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { resetPassword } = useSession();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!email.trim()) {
      setError('Enter your email.');
      return;
    }
    setLoading(true);
    const { error } = await resetPassword(email.trim());
    setLoading(false);
    if (error) setError(error.message);
    else setSentTo(email.trim());
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/sign-in'))}
            style={styles.iconBtn}
            accessibilityLabel="Back">
            <ChevronLeft size={20} color={Palette.ink} />
          </Pressable>
        </View>

        {sentTo ? (
          <View style={styles.content}>
            <View style={styles.copy}>
              <ThemedText type="display" style={styles.emoji}>
                📬
              </ThemedText>
              <ThemedText type="title">Check your inbox</ThemedText>
              <ThemedText type="body" themeColor="textSecondary" style={styles.tagline}>
                We sent a password reset link to{'\n'}
                <ThemedText type="bodyBold">{sentTo}</ThemedText>
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.tagline}>
                Tap the link in that email to set a new password. Check spam if it hasn&apos;t arrived
                in a minute.
              </ThemedText>
            </View>
            <Button title="Back to sign in" onPress={() => router.replace('/sign-in')} />
          </View>
        ) : (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.flex}>
            <View style={styles.content}>
              <View style={styles.copy}>
                <ThemedText type="title">Forgot your password?</ThemedText>
                <ThemedText type="body" themeColor="textSecondary" style={styles.tagline}>
                  Enter your email and we&apos;ll send you a link to reset it.
                </ThemedText>
              </View>

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
                  onSubmitEditing={handleSubmit}
                  returnKeyType="go"
                  autoFocus
                />

                {error && (
                  <ThemedText type="small" themeColor="warningDeep" style={styles.message}>
                    {error}
                  </ThemedText>
                )}

                <Button title="Send reset link" onPress={handleSubmit} loading={loading} />
              </View>
            </View>
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  safeArea: { flex: 1 },
  header: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.two },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    backgroundColor: Palette.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
  copy: { alignItems: 'center', gap: Spacing.two },
  emoji: { marginBottom: Spacing.two },
  tagline: { textAlign: 'center' },
  form: { gap: Spacing.three },
  input: {
    height: 52,
    borderWidth: 1,
    borderRadius: Radius.large,
    paddingHorizontal: Spacing.three,
    fontFamily: Fonts.sans.regular,
    fontSize: 16,
    backgroundColor: Palette.card,
  },
  message: { textAlign: 'center' },
});
