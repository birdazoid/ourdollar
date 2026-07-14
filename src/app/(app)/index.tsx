import { Redirect } from 'expo-router';

// "/" (when authed) lands on the default Week tab.
export default function AppIndex() {
  return <Redirect href="/week" />;
}
