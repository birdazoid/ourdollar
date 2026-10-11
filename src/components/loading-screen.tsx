import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { useReduceMotion } from '@/hooks/use-reduce-motion';

// Matches the native splash (app.json, expo-splash-screen): the same sage, and
// the logo at the same size. splash-icon.png is drawn 120pt wide and the logo
// fills 737 of its 1024px, so it shows 86pt wide, centred. Keeping both
// identical makes the hand-off from the splash invisible: the coin just starts
// falling.
const SAGE = '#8db19c';
const LOGO = 120 * (737 / 1024);
const UNIT = LOGO / 572; // the logo's viewBox is 572 square

// The chimney, measured from the logo path: its opening runs from about x 414
// to 485 with the top edge at y 49.
const CHIMNEY_X = 449.5 * UNIT;
const CHIMNEY_TOP = 49 * UNIT;
const COIN = 9;
const DROP = 56; // how far above the chimney the coin appears

// One loop: the coin falls, the house squashes as it lands, then a short rest.
const PERIOD_MS = 1400;
const FALL_END = 0.32;
const SQUASH_END = 0.42;
const SETTLE_END = 0.66;

// Shared by every LoadingScreen. Loading passes through several screens in a
// row (account, then household, then the first data), each mounting its own
// loader, so timing from a common start keeps the coin moving smoothly across
// those hand-offs instead of jumping back to the top each time.
let clockStart = 0;
function sharedClockStart() {
  if (!clockStart) clockStart = Date.now();
  return clockStart;
}

const HOUSE_PATH =
  'M561.29,229.84c-24.33-25.03-49.57-48.19-76.11-71.39l-.47-89.61c-.05-10.27-10.02-17.63-19.26-19.77l-51.17.58c-12.57.14-20.35,13.7-19.31,25.27l-73.41-61.82c-22.23-18.72-53.8-16.35-76.86.55L89.13,159.25,13.38,229.78C3.65,240.33-1.15,253.59.23,267.68c2.32,23.62,21.92,41.89,46.75,42.42l.43,205.9c.07,31.98,27.98,56.01,60.12,56l224.76-.07,136-.32c29.4-.07,52.18-24.56,55.56-52.37l.05-125.47.15-83.58c25.51-1.03,44.95-19.1,47.72-43.6,1.21-13.14-2.62-25.76-10.49-36.74ZM387.77,411.35c-12.7,29.43-40.76,44.82-71.3,50.35l-.32,22.65c-.17,12.34-11.12,22.38-23.01,22.28l-18.06-.16c-12.92-1.4-22.1-12.87-21.93-25.72l.25-18.67c-23.93-3.91-46.35-13.23-64.74-28.76-13.04-11.02-16-28.14-6.05-42.06,3.52-4.92,7.22-10.21,12.21-13.55,11.05-7.4,23.22-6.12,33.38,1.83,19.82,15.5,44.05,22.95,68.98,19.34,13.79-2,25.85-8.58,26.29-21.76.46-13.82-15.46-21.27-29.09-25.73l-39.04-12.79c-12.43-4.07-23.87-8.62-35.23-14.88-23.47-12.92-38.98-35.09-41.63-62.03-2.88-29.24,8.98-57.54,32.63-74.87,12.56-9.2,26.43-14.4,41.95-17.29l.29-15.89c-.96-13.01,6.91-26.19,20.83-27.63h21.8c11.05,0,18.93,11.1,20.08,21.71l.51,21.65c21.43,4.92,41.89,13.52,57.97,28.72,7.61,7.2,11,18.58,7.13,28.17-3.45,8.53-9.55,15.94-16.63,21.25-10.12,7.58-22.53,6.9-32.55-.25-16.42-11.71-35.44-17.67-55.62-15.71-13.42,1.3-26.11,7.86-26.51,20.7-.41,13.15,13.79,20.46,27.17,24.93l46.43,15.52c12.45,4.16,23.78,9.38,34.95,16.15,35.72,21.65,44.73,65.73,28.87,102.49Z';

/**
 * Full-screen loader shown while the app fetches what the first screen needs:
 * the splash logo with a coin dropping down the chimney. Under Reduce Motion
 * it's the still logo, exactly like the splash.
 */
export function LoadingScreen() {
  const reduceMotion = useReduceMotion();
  const [start] = useState(sharedClockStart);
  // 0..1 through the current loop.
  const phase = useSharedValue(0);

  useFrameCallback(() => {
    phase.value = ((Date.now() - start) % PERIOD_MS) / PERIOD_MS;
  }, !reduceMotion);

  const coinStyle = useAnimatedStyle(() => {
    const p = phase.value;
    if (p >= FALL_END) return { opacity: 0, transform: [{ translateY: 0 }] };
    const fall = p / FALL_END;
    // Speeds up as it falls, and ends fully inside the chimney.
    const y = fall * fall * (DROP + COIN);
    return { opacity: Math.min(1, fall * 6), transform: [{ translateY: y }] };
  });

  const houseStyle = useAnimatedStyle(() => {
    const p = phase.value;
    let squash = 0; // 1 = fully squashed
    if (p >= FALL_END && p < SQUASH_END) {
      squash = (p - FALL_END) / (SQUASH_END - FALL_END);
    } else if (p >= SQUASH_END && p < SETTLE_END) {
      const k = (p - SQUASH_END) / (SETTLE_END - SQUASH_END);
      // Springs back, overshooting a touch before resting.
      squash = Math.cos(k * Math.PI * 1.5) * (1 - k);
    }
    return {
      transform: [{ scaleX: 1 + 0.04 * squash }, { scaleY: 1 - 0.07 * squash }],
    };
  });

  return (
    <View
      style={styles.fill}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading">
      <View style={styles.logo}>
        {!reduceMotion && (
          <View style={styles.coinTrack} pointerEvents="none">
            <Animated.View style={[styles.coin, coinStyle]} />
          </View>
        )}
        <Animated.View style={[styles.house, houseStyle]}>
          <Svg width={LOGO} height={LOGO} viewBox="0 0 572 572">
            <Path d={HOUSE_PATH} fill="#FFFFFF" />
          </Svg>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: SAGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { width: LOGO, height: LOGO },
  house: { width: LOGO, height: LOGO, transformOrigin: 'bottom' },
  // Clips the coin at the chimney's top edge, so it disappears down it.
  coinTrack: {
    position: 'absolute',
    left: CHIMNEY_X - COIN / 2,
    top: CHIMNEY_TOP - DROP - COIN,
    width: COIN,
    height: DROP + COIN,
    overflow: 'hidden',
  },
  coin: {
    width: COIN,
    height: COIN,
    borderRadius: COIN / 2,
    backgroundColor: '#FFFFFF',
  },
});
