import IconCamping from '@/assets/icons/icon-camping.svg';
import IconCelebrate from '@/assets/icons/icon-celebrate.svg';
import IconEducation from '@/assets/icons/icon-education.svg';
import IconGiftBox from '@/assets/icons/icon-gift-box.svg';
import IconHousing from '@/assets/icons/icon-housing.svg';
import IconMedical from '@/assets/icons/icon-medical.svg';
import IconPets from '@/assets/icons/icon-pets.svg';
import IconSave from '@/assets/icons/icon-save.svg';
import IconSuv from '@/assets/icons/icon-suv.svg';
import IconVacation from '@/assets/icons/icon-vacation.svg';
import IconWedding from '@/assets/icons/icon-wedding.svg';
import { ThemedText } from '@/components/themed-text';
import { Palette } from '@/constants/theme';

// Every GOAL_EMOJI_OPTIONS entry has a matching icon, plus the 🎯 default/unset
// state, which uses the save icon.
const GOAL_EMOJI_ICONS: Record<string, typeof IconSave> = {
  '🎯': IconSave,
  '🎁': IconGiftBox,
  '🚗': IconSuv,
  '🏕️': IconCamping,
  '🏠': IconHousing,
  '✈️': IconVacation,
  '🎓': IconEducation,
  '💍': IconWedding,
  '🩺': IconMedical,
  '🐾': IconPets,
  '🎉': IconCelebrate,
};

/** Renders a savings-goal icon: matches a picked emoji to its icon, and treats an unset/default emoji as the save icon. */
export function GoalGlyph({
  emoji,
  color = Palette.ink,
  size = 26,
}: {
  emoji?: string | null;
  color?: string;
  size?: number;
}) {
  const Icon = emoji ? GOAL_EMOJI_ICONS[emoji] : IconSave;
  if (Icon) return <Icon width={size} height={size} color={color} />;
  return <ThemedText type="subtitle">{emoji}</ThemedText>;
}
