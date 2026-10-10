import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * The app's haptic vocabulary. Kept deliberately small so each one keeps its
 * meaning: if everything buzzes, nothing does.
 *
 *   tap      a light touch on a primary action (the + button)
 *   select   a choice changed (switch, toggle, category, day)
 *   success  something real was recorded: an expense saved, a bill paid
 *   warning  the household just went over this week's money
 *
 * Fire-and-forget: a phone in Low Power Mode, or with system haptics off, just
 * stays still, and that must never surface as an error. Off on web, where the
 * vibration fallback is a desktop no-op at best and a phone-wide buzz at worst.
 */
const run = (fn: () => Promise<void>) => {
  if (Platform.OS === 'web') return;
  fn().catch(() => {});
};

export const haptic = {
  tap: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  select: () => run(() => Haptics.selectionAsync()),
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
