import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { PasswordField } from '@/components/inputs';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth';

export default function ResetPasswordScreen() {
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
              <PasswordField
                placeholder="New password"
                value={password}
                onChangeText={setPassword}
                editable={!loading}
                autoFocus
              />
              <PasswordField
                placeholder="Confirm new password"
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
  message: { textAlign: 'center' },
});
