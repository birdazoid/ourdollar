import { Check } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { AvatarGlyph } from '@/components/avatar-glyph';
import { Sheet } from '@/components/sheet';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { AVATAR_OPTIONS } from '@/lib/categories';

type Props = {
  visible: boolean;
  current: string | null | undefined;
  onPick: (avatar: string) => void;
  onClose: () => void;
};

/**
 * Avatar picker.
 *
 * These used to sit inline under the profile header at 40px, which is small
 * enough that the characters were unidentifiable — you were choosing between
 * ten coloured dots. A sheet costs no permanent screen space, so each one gets
 * enough room to actually be seen and named.
 */
export function AvatarPickerSheet({ visible, current, onPick, onClose }: Props) {
  return (
    <Sheet visible={visible} title="Pick your look" onClose={onClose}>
      <ThemedText type="body" themeColor="textSecondary" style={styles.blurb}>
        This is how you show up on expenses and in your household.
      </ThemedText>
      <View style={styles.grid}>
        {AVATAR_OPTIONS.map((a) => {
          const selected = a === current;
          return (
            <Pressable
              key={a}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={selected ? `${a}, currently selected` : a}
              onPress={() => onPick(a)}
              style={[styles.option, selected && styles.optionSelected]}>
              <AvatarGlyph value={a} size={64} />
              {selected && (
                <View style={styles.check}>
                  <Check size={12} color={Palette.card} strokeWidth={3} />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  blurb: { marginBottom: Spacing.three },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingBottom: Spacing.two,
  },
  // 68 rather than something larger: with the sheet's 24pt padding and a 16pt
  // gap it's the biggest tile that still fits FOUR per row on a 375pt screen.
  // At 76 only three fit, which wastes 67pt of every row and leaves a stray
  // single on the last one.
  option: {
    width: 68,
    height: 68,
    borderRadius: Radius.pill,
    backgroundColor: Palette.card,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  // The one you're already using, so opening the sheet answers "which am I?"
  optionSelected: { borderColor: Palette.sageDeep },
  check: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 20,
    height: 20,
    borderRadius: Radius.pill,
    backgroundColor: Palette.sageDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
