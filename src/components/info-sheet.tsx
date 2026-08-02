import { Info } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Sheet } from '@/components/sheet';
import { ThemedText } from '@/components/themed-text';
import { Palette, Spacing } from '@/constants/theme';

type Props = {
  visible: boolean;
  title: string;
  /** One short paragraph per entry. Keep each to a couple of sentences. */
  paragraphs: string[];
  closeLabel?: string;
  onClose: () => void;
};

/**
 * Short explainer sheet. The pattern for anything that needs more than a line:
 * the screen itself stays at one line, and the detail sits one tap away behind
 * an InfoTap, so the app doesn't get wordier as it gets smarter.
 */
export function InfoSheet({ visible, title, paragraphs, closeLabel = 'Got it', onClose }: Props) {
  return (
    <Sheet visible={visible} title={title} onClose={onClose}>
      {paragraphs.map((p, i) => (
        <ThemedText key={i} type="body" themeColor="textSecondary" style={styles.para}>
          {p}
        </ThemedText>
      ))}
      <View style={styles.action}>
        <Button title={closeLabel} onPress={onClose} />
      </View>
    </Sheet>
  );
}

/** The small ⓘ affordance that opens an InfoSheet. */
export function InfoTap({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={10}>
      <Info size={15} color={Palette.sandDeep} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  para: { marginBottom: Spacing.two },
  action: { marginTop: Spacing.two },
});
