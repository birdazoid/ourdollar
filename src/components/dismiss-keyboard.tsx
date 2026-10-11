import type { ReactNode } from 'react';
import { Keyboard, Platform, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Closes the keyboard when someone taps anywhere outside a text field. For
 * screens whose fields sit in a plain View rather than a ScrollView (which
 * does this through keyboardShouldPersistTaps): without it, Return was the
 * only way to close the keyboard, and it stayed over the Continue button.
 *
 * Phones only. On web a click inside a field bubbles up to this Pressable and
 * blurred the field straight away, so nothing could be typed; browsers already
 * blur a field when you click elsewhere.
 */
export function DismissKeyboard({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  if (Platform.OS === 'web') {
    return <View style={[{ flex: 1 }, style]}>{children}</View>;
  }
  return (
    <Pressable accessible={false} onPress={Keyboard.dismiss} style={[{ flex: 1 }, style]}>
      {children}
    </Pressable>
  );
}
