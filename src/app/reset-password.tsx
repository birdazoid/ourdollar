import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Palette, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/auth';

export default function ResetPasswordScreen() {
  const theme = useTheme();
  const { updatePassword, clearRecovery } = useSession();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords don’t match.');
      return;
    }
    setLoading(true);
    const { error } = await updatePassword(password);
    setLoading(false);
    if (error) setError(error.message);
    else clearRecovery();
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}>
          <View style={styles.content}>
            <View style={styles.copy}>
              <ThemedText type="title">Set a new password</ThemedText>
              <ThemedText type="body" themeColor="textSecondary" style={styles.tagline}>
                Choose a new password for your account.
              </ThemedText>
            </View>

            <View style={styles.form}>
              <TextInput
                style={[styles.input, { color: theme.text, borderColor: theme.accentDeep }]}
                placeholder="New password"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="none"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                editable={!loading}
                autoFocus
              />
              <TextInput
                style={[styles.input, { color: theme.text, borderColor: theme.accentDeep }]}
                placeholder="Confirm new password"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="none"
                secureTextEntry
                value={confirm}
                onChangeText={setConfirm}
                editable={!loading}
                onSubmitEditing={handleSubmit}
                returnKeyType="go"
              />

              {error && (
                <ThemedText type="small" themeColor="warningDeep" style={styles.message}>
                  {error}
                </ThemedText>
              )}

              <Button title="Save new password" onPress={handleSubmit} loading={loading} />
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
    gap: Spacing.four,
  },
  copy: { alignItems: 'center', gap: Spacing.two },
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
