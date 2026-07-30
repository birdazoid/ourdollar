import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Per-user flag — biometric unlock is a device+account preference, not
// something that needs to sync across devices, so SecureStore (device-local,
// Keychain-backed) is enough; no server round-trip needed.
function storageKey(userId: string) {
  return `ourdollar.biometricLock.${userId}`;
}

export async function isBiometricSupported() {
  // expo-secure-store has no web implementation at all in this SDK (its
  // ExpoSecureStore.web.ts is an empty stub) — any SecureStore call throws
  // unconditionally on web, so treat biometrics as unsupported there before
  // ever touching it, same as there being no Face ID hardware.
  if (Platform.OS === 'web') return false;
  const [hasHardware, isEnrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  return hasHardware && isEnrolled;
}

export async function isBiometricLockEnabled(userId: string) {
  if (Platform.OS === 'web') return false;
  const value = await SecureStore.getItemAsync(storageKey(userId));
  return value === '1';
}

export async function setBiometricLockEnabled(userId: string, enabled: boolean) {
  if (Platform.OS === 'web') return;
  if (enabled) {
    await SecureStore.setItemAsync(storageKey(userId), '1');
  } else {
    await SecureStore.deleteItemAsync(storageKey(userId));
  }
}

export async function authenticateWithBiometrics(promptMessage: string) {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    disableDeviceFallback: false,
  });
  return result.success;
}
