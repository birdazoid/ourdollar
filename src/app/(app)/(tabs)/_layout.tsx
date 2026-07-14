import { Tabs } from 'expo-router/js-tabs';

import { TabBar } from '@/components/tab-bar';

export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="week"
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="bills" />
      <Tabs.Screen name="week" />
      <Tabs.Screen name="overview" />
      <Tabs.Screen name="setup" />
    </Tabs>
  );
}
