import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Palette, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

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
        value={value}
        onChangeText={(t) => onChangeText(t.replace(/[^0-9.]/g, ''))}
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
