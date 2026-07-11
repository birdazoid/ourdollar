/**
 * Design tokens — colors, type scale, spacing — from design-brief.md §7.
 * Every screen should pull from these instead of re-declaring styles.
 */

import { Platform } from 'react-native';

export const Palette = {
  linen: '#F4F1DE',
  card: '#FFFFFF',
  ink: '#3D405B',
  sage: '#81B29A',
  sageDeep: '#5E8F77',
  sand: '#F2CC8F',
  sandDeep: '#C9974A',
  terracotta: '#E07A5F',
  terracottaDeep: '#C25A40',
} as const;

// The design brief doesn't specify a dark variant yet — both keys point at
// the same warm palette for now so system dark mode doesn't produce an
// undesigned black screen. Revisit if/when a dark theme is designed.
export const Colors = {
  light: {
    background: Palette.linen,
    card: Palette.card,
    text: Palette.ink,
    textSecondary: '#6B6E8C',
    positive: Palette.sage,
    positiveDeep: Palette.sageDeep,
    accent: Palette.sand,
    accentDeep: Palette.sandDeep,
    warning: Palette.terracotta,
    warningDeep: Palette.terracottaDeep,
  },
  dark: {
    background: Palette.linen,
    card: Palette.card,
    text: Palette.ink,
    textSecondary: '#6B6E8C',
    positive: Palette.sage,
    positiveDeep: Palette.sageDeep,
    accent: Palette.sand,
    accentDeep: Palette.sandDeep,
    warning: Palette.terracotta,
    warningDeep: Palette.terracottaDeep,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

// Fraunces (serif) for display/headings/dollar figures, Karla (sans) for
// body copy and UI labels, per design-brief.md §7. Space Mono for dollar
// figures specifically is an open decision (design-brief.md §7, §10) —
// not wired in yet.
export const Fonts = {
  serif: {
    regular: 'Fraunces_400Regular',
    semiBold: 'Fraunces_600SemiBold',
    bold: 'Fraunces_700Bold',
  },
  sans: {
    regular: 'Karla_400Regular',
    medium: 'Karla_500Medium',
    bold: 'Karla_700Bold',
  },
} as const;

export const FontsToLoad = {
  Fraunces_400Regular: require('@expo-google-fonts/fraunces/400Regular/Fraunces_400Regular.ttf'),
  Fraunces_600SemiBold: require('@expo-google-fonts/fraunces/600SemiBold/Fraunces_600SemiBold.ttf'),
  Fraunces_700Bold: require('@expo-google-fonts/fraunces/700Bold/Fraunces_700Bold.ttf'),
  Karla_400Regular: require('@expo-google-fonts/karla/400Regular/Karla_400Regular.ttf'),
  Karla_500Medium: require('@expo-google-fonts/karla/500Medium/Karla_500Medium.ttf'),
  Karla_700Bold: require('@expo-google-fonts/karla/700Bold/Karla_700Bold.ttf'),
};

// Type scale — display for hero dollar figures, title/subtitle for
// headings, body/label/small for copy and UI chrome.
export const Type = {
  display: { fontFamily: Fonts.serif.bold, fontSize: 40, lineHeight: 46 },
  title: { fontFamily: Fonts.serif.semiBold, fontSize: 28, lineHeight: 34 },
  subtitle: { fontFamily: Fonts.serif.semiBold, fontSize: 20, lineHeight: 26 },
  body: { fontFamily: Fonts.sans.regular, fontSize: 16, lineHeight: 22 },
  bodyBold: { fontFamily: Fonts.sans.bold, fontSize: 16, lineHeight: 22 },
  label: { fontFamily: Fonts.sans.medium, fontSize: 14, lineHeight: 18 },
  small: { fontFamily: Fonts.sans.regular, fontSize: 12, lineHeight: 16 },
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  small: 8,
  medium: 12,
  large: 20,
  pill: 999,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
