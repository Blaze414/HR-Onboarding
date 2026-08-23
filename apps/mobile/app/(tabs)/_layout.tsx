import { Tabs } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { Icon, type IconName } from '@/components/Icon';
import { useBottomInset } from '@/lib/useBottomInset';
import { useTheme } from '@/theme';

/**
 * Five tabs, all of them things an employee does in a short session. Anything
 * that belongs to running the workplace lives on desktop instead.
 */
const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Home', icon: 'dashboard' },
  { name: 'courses', title: 'Courses', icon: 'course' },
  { name: 'tasks', title: 'Tasks', icon: 'task' },
  { name: 'events', title: 'Events', icon: 'event' },
  { name: 'me', title: 'Me', icon: 'profile' },
];

/** Room for a 22pt icon, its label, and breathing space above the home bar. */
const BAR_CONTENT_HEIGHT = 56;

export default function TabsLayout() {
  const { colors } = useTheme();

  // Grows by whatever is actually covering the bottom right now — a home
  // indicator on a phone, a browser toolbar on the web, nothing on a laptop.
  const bottomInset = useBottomInset(12);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkSubtle,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.rail,
          height: BAR_CONTENT_HEIGHT + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: 6,
        },
        tabBarItemStyle: { paddingTop: 4, paddingBottom: 2 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color }) => <Icon name={tab.icon} color={color} size={22} />,
            // The default label is a single-line Text, which the web renderer
            // clips with `overflow: hidden` around a line box derived from the
            // font. Where the platform reports different metrics than the box
            // assumes — iOS does — the glyphs get sliced. Rendering the label
            // directly, with no line clamp, removes the crop entirely.
            tabBarLabel: ({ color }) => (
              <Text style={[styles.label, { color }]}>{tab.title}</Text>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    textAlign: 'center',
    includeFontPadding: false,
  },
});
