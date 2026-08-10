import { Eye, EyeOff } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Palette, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { groupAmountInput, sanitizeAmountInput } from '@/lib/money';

/** Bordered rounded text input for names/labels. */
export function TextField({ style, ...props }: TextInputProps) {
  const theme = useTheme();
  return (
    <TextInput
      placeholderTextColor="#B7B8C4"
      style={[styles.field, { color: theme.text }, style]}
      {...props}
    />
  );
}

type MoneyInputProps = Omit<TextInputProps, 'onChangeText' | 'value'> & {
  value: string;
  onChangeText: (v: string) => void;
  size?: number;
};

/** "$ [amount]" inside a card. Strips non-numeric input. */
export function MoneyInput({ value, onChangeText, size = 30, style, ...props }: MoneyInputProps) {
  const theme = useTheme();
  return (
    <Card style={styles.moneyCard}>
      <ThemedText type="display" themeColor="textSecondary" style={{ fontSize: size }}>
        $
      </ThemedText>
      <TextInput
        value={groupAmountInput(value)}
        onChangeText={(t) => onChangeText(sanitizeAmountInput(t))}
        keyboardType="decimal-pad"
        inputMode="decimal"
        placeholder="0.00"
        placeholderTextColor="#B7B8C4"
        style={[styles.moneyInput, { color: theme.text, fontSize: size }, style]}
        {...props}
      />
    </Card>
  );
}

/** Bordered password input with a show/hide toggle. Used by the auth screens. */
export function PasswordField(props: Omit<TextInputProps, 'secureTextEntry' | 'style'>) {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);
  const ToggleIcon = visible ? EyeOff : Eye;
  return (
    <View style={[styles.passwordRow, { borderColor: theme.accentDeep }]}>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        secureTextEntry={!visible}
        placeholderTextColor={theme.textSecondary}
        style={[styles.passwordInput, { color: theme.text }]}
        {...props}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        hitSlop={Spacing.two}
        onPress={() => setVisible((v) => !v)}
        style={styles.passwordToggle}>
        <ToggleIcon size={20} color={Palette.ink} />
      </Pressable>
    </View>
  );
}

/** Small field label (uppercase-ish helper text above inputs). */
export function FieldLabel({ children }: { children: string }) {
  return (
    <ThemedText type="label" themeColor="textSecondary" style={styles.label}>
      {children}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  field: {
    height: 52,
    borderRadius: Radius.large,
    backgroundColor: Palette.card,
    paddingHorizontal: Spacing.three,
    fontFamily: Fonts.sans.medium,
    fontSize: 16,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderWidth: 1,
    borderRadius: Radius.large,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.two,
    backgroundColor: Palette.card,
  },
  passwordInput: {
    flex: 1,
    height: '100%',
    fontFamily: Fonts.sans.regular,
    fontSize: 16,
  },
  passwordToggle: { padding: Spacing.two },
  moneyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.four,
  },
  moneyInput: {
    flex: 1,
    fontFamily: Fonts.serif.bold,
    padding: 0,
  },
  label: {
    marginTop: Spacing.three,
    marginBottom: Spacing.two,
  },
});
