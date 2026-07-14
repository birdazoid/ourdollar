import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Palette, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/auth';

type Mode = 'signIn' | 'signUp';

export default function SignInScreen() {
  const theme = useTheme();
  const { signIn, signUp } = useSession();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isSignIn = mode === 'signIn';

  async function handleSubmit() {
    setError(null);
    setNotice(null);
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
      const { error, needsConfirmation } = await signUp(email.trim(), password);
      if (error) {
        setError(error.message);
      } else if (needsConfirmation) {
        setNotice('Check your email to confirm your account, then sign in.');
        setMode('signIn');
      }
    }
    setLoading(false);
  }

  function toggleMode() {
    setMode(isSignIn ? 'signUp' : 'signIn');
    setError(null);
    setNotice(null);
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
              <ThemedText type="body" themeColor="textSecondary">
                {isSignIn ? 'Welcome back.' : 'Create your account.'}
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
              />
              <TextInput
                style={[styles.input, { color: theme.text, borderColor: theme.accentDeep }]}
                placeholder="Password"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="none"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                editable={!loading}
                onSubmitEditing={handleSubmit}
                returnKeyType="go"
              />

              {error && (
                <ThemedText type="small" themeColor="warningDeep" style={styles.message}>
                  {error}
                </ThemedText>
              )}
              {notice && (
                <ThemedText type="small" themeColor="positiveDeep" style={styles.message}>
                  {notice}
                </ThemedText>
              )}

              <Button
                title={isSignIn ? 'Sign in' : 'Create account'}
                onPress={handleSubmit}
                loading={loading}
              />
              <Button
                title={isSignIn ? 'New here? Create an account' : 'Have an account? Sign in'}
                variant="secondary"
                onPress={toggleMode}
                disabled={loading}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
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
    gap: Spacing.five,
  },
  header: {
    alignItems: 'center',
    gap: Spacing.two,
  },
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
});
