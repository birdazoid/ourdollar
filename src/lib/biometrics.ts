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

// Showing the native Face ID/Touch ID sheet drives the app through its own
// foreground/background transitions. Callers that react to those transitions
// must never stack a second prompt on top of a live one, or each prompt's own
// dismissal triggers the next and the user is stuck re-scanning forever.
//
// This is an in-flight flag, not a time window: a cooldown is a race against
// however long the OS takes to deliver the transition, and loses whenever the
// dismissal event lands after the window closes. `settleUntil` only covers the
// brief gap between the promise resolving and that final event arriving.
let promptInFlight = false;
let settleUntil = 0;
const SETTLE_MS = 1500;

export function isBiometricPromptActive() {
  return promptInFlight || Date.now() < settleUntil;
}

export async function authenticateWithBiometrics(promptMessage: string) {
  promptInFlight = true;
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      disableDeviceFallback: false,
    });
    return result.success;
  } finally {
    promptInFlight = false;
    settleUntil = Date.now() + SETTLE_MS;
  }
}
