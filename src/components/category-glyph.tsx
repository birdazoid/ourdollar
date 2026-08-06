import type { ComponentType } from 'react';
import type { SvgProps } from 'react-native-svg';

import IconDining from '@/assets/icons/icon-dining.svg';
import IconDonations from '@/assets/icons/icon-donations.svg';
import IconEducation from '@/assets/icons/icon-education.svg';
import IconEntertainment from '@/assets/icons/icon-entertainment.svg';
import IconFuel from '@/assets/icons/icon-fuel.svg';
import IconGroceries from '@/assets/icons/icon-groceries.svg';
import IconHousehold from '@/assets/icons/icon-household.svg';
import IconHousing from '@/assets/icons/icon-housing.svg';
import IconKids from '@/assets/icons/icon-kids.svg';
import IconLoans from '@/assets/icons/icon-loans.svg';
import IconMedical from '@/assets/icons/icon-medical.svg';
import IconOther from '@/assets/icons/icon-other.svg';
import IconPersonal from '@/assets/icons/icon-personal.svg';
import IconPets from '@/assets/icons/icon-pets.svg';
import IconSubscriptions from '@/assets/icons/icon-subscriptions.svg';
import IconUtilities from '@/assets/icons/icon-utilities.svg';
import { ThemedText } from '@/components/themed-text';
import { Palette } from '@/constants/theme';
import type { BillCategory } from '@/lib/categories';

// Every TX_CATEGORIES/BILL_CATS entry now has a matching icon; emoji only
// remains as a fallback for any future category added without one.
const TX_CATEGORY_ICONS: Record<string, ComponentType<SvgProps>> = {
  groceries: IconGroceries,
  fuel: IconFuel,
  dining: IconDining,
  household: IconHousehold,
  kids: IconKids,
  pets: IconPets,
  personal: IconPersonal,
  entertainment: IconEntertainment,
  other: IconOther,
};

const BILL_CATEGORY_ICONS: Partial<Record<BillCategory, ComponentType<SvgProps>>> = {
  Housing: IconHousing,
  Loans: IconLoans,
  'Bills & Utilities': IconUtilities,
  Education: IconEducation,
  Kids: IconKids,
  Subscriptions: IconSubscriptions,
  Medical: IconMedical,
  Donations: IconDonations,
  Other: IconOther,
};

type Props = {
  txId?: string;
  billCategory?: string;
  emoji: string;
  color?: string;
  size?: number;
};

/**
 * Renders the matching category SVG for a tx category id or bill category name,
 * falling back to the emoji glyph.
 *
 * Category icons are ink everywhere. The per-category colors in TX_CATEGORIES
 * still drive charts and progress fills, but tinting the glyphs with them made
 * the lighter categories hard to read, so callers should leave `color` alone.
 */
export function CategoryGlyph({ txId, billCategory, emoji, color = Palette.ink, size = 26 }: Props) {
  const Icon = (txId && TX_CATEGORY_ICONS[txId]) || (billCategory && BILL_CATEGORY_ICONS[billCategory as BillCategory]);
  if (Icon) return <Icon width={size} height={size} color={color} />;
  return <ThemedText type="subtitle">{emoji}</ThemedText>;
}
