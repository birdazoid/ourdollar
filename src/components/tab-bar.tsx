import { useRouter } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Plus, type LucideIcon } from 'lucide-react-native';
import type { ComponentType } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SvgProps } from 'react-native-svg';

import IconBills from '@/assets/icons/icon-bills.svg';
import IconGraph from '@/assets/icons/icon-graph.svg';
import IconSettings from '@/assets/icons/icon-settings.svg';
import IconWeek from '@/assets/icons/icon-week.svg';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';

const TABS: Record<string, { icon: LucideIcon | ComponentType<SvgProps>; label: string }> = {
  bills: { icon: IconBills, label: 'Bills' },
  week: { icon: IconWeek, label: 'Week' },
  overview: { icon: IconGraph, label: 'Overview' },
  setup: { icon: IconSettings, label: 'Setup' },
};

// Bills · Week · [ + ] · Overview · Setup
const LEFT = ['bills', 'week'];
const RIGHT = ['overview', 'setup'];

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const activeName = state.routes[state.index]?.name;

  const go = (name: string) => {
    const event = navigation.emit({ type: 'tabPress', target: name, canPreventDefault: true });
    if (!event.defaultPrevented) navigation.navigate(name);
  };

  const renderTab = (name: string) => {
    const cfg = TABS[name];
    if (!cfg) return null;
    const Icon = cfg.icon;
    const active = activeName === name;
    const color = active ? Palette.sageDeep : '#B7B8C4';
    return (
      <Pressable
        key={name}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        onPress={() => go(name)}
        style={styles.tab}>
        <Icon width={25} height={25} color={color} strokeWidth={active ? 2.6 : 2} />
        <ThemedText type="small" style={[styles.tabLabel, { color }]}>
          {cfg.label}
        </ThemedText>
      </Pressable>
    );
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: insets.bottom + Spacing.two }]}>
      <View style={styles.bar}>
        {LEFT.map(renderTab)}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add expense"
          onPress={() => router.push('/add-expense')}
          style={styles.plus}>
          <Plus size={28} color={Palette.card} strokeWidth={2.8} />
        </Pressable>
        {RIGHT.map(renderTab)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
  },
  bar: {
    width: '100%',
    maxWidth: 440,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: Radius.large + 6,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    shadowColor: Palette.ink,
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  tab: {
    alignItems: 'center',
    gap: 3,
    minWidth: 46,
  },
  tabLabel: {
    fontSize: 10.5,
  },
  plus: {
    width: 58,
    height: 58,
    marginTop: -34,
    borderRadius: Radius.pill,
    backgroundColor: Palette.sage,
    borderWidth: 4,
    borderColor: 'rgba(244,241,222,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Palette.sage,
    shadowOpacity: 0.55,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
});
