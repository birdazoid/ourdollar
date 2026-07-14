import { StyleSheet, View, type ViewProps } from 'react-native';

import { Palette, Radius, Spacing } from '@/constants/theme';

/** White rounded surface with the app's soft shadow. Base of every list row/card. */
export function Card({ style, ...rest }: ViewProps) {
  return <View style={[styles.card, style]} {...rest} />;
}

export const cardShadow = {
  shadowColor: Palette.ink,
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;

const styles = StyleSheet.create({
  card: {
    backgroundColor: Palette.card,
    borderRadius: Radius.large,
    padding: Spacing.three,
    ...cardShadow,
  },
});
