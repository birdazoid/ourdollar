import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { syncPushToken } from '@/lib/notifications';

export default function HomeScreen() {
  const { session, signOut } = useSession();
  const [pushStatus, setPushStatus] = useState('Registering for notifications…');

  useEffect(() => {
    const accountId = session?.user.id;
    if (!accountId) return;
    let active = true;
    syncPushToken(accountId)
      .then((token) => {
        if (!active) return;
        setPushStatus(token ? `Push token saved:\n${token}` : 'Push not available on this device.');
      })
      .catch((err) => {
        if (active) setPushStatus(`Push registration failed: ${err.message ?? err}`);
      });
    return () => {
      active = false;
    };
  }, [session?.user.id]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText type="display">OurDollar</ThemedText>
          <ThemedText type="body" themeColor="textSecondary">
            Signed in as {session?.user.email}
          </ThemedText>
        </View>

        <ThemedText type="small" themeColor="textSecondary" style={styles.push}>
          {pushStatus}
        </ThemedText>

        <Button title="Sign out" variant="secondary" onPress={signOut} />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
  },
  header: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  push: {
    textAlign: 'center',
  },
});
