import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

// How notifications behave when one arrives while the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function getProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId
  );
}

/**
 * Requests notification permission and returns the device's Expo push token,
 * or null if we can't get one (no permission, not a physical device, etc.).
 * Safe to call on web — returns null.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web' || !Device.isDevice) {
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let granted =
    existing.granted ||
    existing.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

  if (!granted) {
    const requested = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    granted =
      requested.granted ||
      requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  }

  if (!granted) {
    return null;
  }

  const projectId = getProjectId();
  if (!projectId) {
    console.warn('No EAS projectId found; cannot fetch an Expo push token.');
    return null;
  }

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  return token;
}

/**
 * Registers this device for push and upserts the token into push_tokens for the
 * given account. Idempotent — keyed on the token, refreshing last_seen_at.
 */
export async function syncPushToken(accountId: string): Promise<string | null> {
  const token = await registerForPushNotificationsAsync();
  if (!token) {
    return null;
  }

  const { error } = await supabase.from('push_tokens').upsert(
    {
      account_id: accountId,
      expo_push_token: token,
      device_platform: Platform.OS,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'expo_push_token' }
  );

  if (error) {
    console.warn('Failed to save push token:', error.message);
    return null;
  }

  return token;
}
