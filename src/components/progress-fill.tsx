import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';

import { useTween } from '@/hooks/use-tween';

/**
 * The coloured fill of a progress bar, sized as a fraction of its track. Grows
 * from empty on first view and slides to each new value, so spending against a
 * category visibly eats into it. Put it inside the track view.
 */
export function ProgressFill({ value, style }: { value: number; style?: StyleProp<ViewStyle> }) {
  const shown = useTween(Math.max(0, Math.min(1, value)), { from: 0, duration: 600 });
  return <View style={[style, { width: `${shown * 100}%` }]} />;
}
