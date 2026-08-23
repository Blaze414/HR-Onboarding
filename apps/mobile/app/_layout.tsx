import * as Notifications from 'expo-notifications';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/auth';
import { setupProgressiveWebApp } from '@/lib/pwa';
import { desktopUrl, enforceSurface } from '@/lib/surfaceRedirect';
import { ThemeProvider, useTheme } from '@/theme';

function Gate() {
  const { colors, scheme } = useTheme();
  const { loading, session } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  /*
   * Tapping a reminder opens what it is about.
   *
   * A push that drops somebody on the home screen makes them hunt for the thing
   * that just interrupted them, which is worse than not sending it. The href is
   * the same in-app path the notification list uses.
   */
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const href = response.notification.request.content.data?.href;
      if (typeof href === 'string' && href.startsWith('/')) router.push(href as never);
    });
    return () => sub.remove();
  }, [router]);

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!session && !inAuthGroup) router.replace('/(auth)/login');
    if (session && inAuthGroup) router.replace('/(tabs)');
  }, [loading, session, segments, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.ink,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="(auth)/login" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="courses/[id]"
        options={{ headerShown: true, title: 'Course', headerBackTitle: 'Back' }}
      />
      <Stack.Screen name="tasks/[id]" options={{ headerShown: true, title: 'Task', headerBackTitle: 'Back' }} />
      <Stack.Screen name="events/[id]" options={{ headerShown: true, title: 'Event', headerBackTitle: 'Back' }} />
      <Stack.Screen name="documents" options={{ headerShown: true, title: 'Documents', headerBackTitle: 'Back' }} />
      <Stack.Screen name="overview" options={{ headerShown: true, title: 'What needs you', headerBackTitle: 'Back' }} />
      <Stack.Screen name="team" options={{ headerShown: true, title: 'My team', headerBackTitle: 'Back' }} />
      <Stack.Screen name="credentials" options={{ headerShown: true, title: 'My certificates', headerBackTitle: 'Back' }} />
      <Stack.Screen name="requests" options={{ headerShown: true, title: 'Requested from you', headerBackTitle: 'Back' }} />
      <Stack.Screen name="onboarding" options={{ headerShown: true, title: 'My onboarding', headerBackTitle: 'Back' }} />
      <Stack.Screen name="notifications" options={{ headerShown: true, title: 'Notifications', headerBackTitle: 'Back' }} />
    </Stack>
  );
}

/**
 * Sizes the app shell to the viewport a mobile browser actually leaves visible.
 *
 * `100vh` ignores browser chrome entirely. `100dvh` tracks it dynamically,
 * which sounds right but resolves to the *large* viewport on iOS when the page
 * cannot scroll — the shell then runs behind the bottom toolbar and the tab
 * labels get clipped. `100svh` is the small viewport: the height that stays
 * visible with the toolbars shown, which is exactly what a fixed app shell
 * wants. The ladder degrades to `100%` on anything that supports neither.
 */
function useWebViewportHeight() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const id = 'snoopy-viewport-fix';
    if (document.getElementById(id)) return;

    // `env(safe-area-inset-*)` stays zero unless the page opts into drawing
    // under the browser's own chrome, which is what viewport-fit=cover does.
    // Without it there is no channel at all for knowing what the toolbar covers.
    const meta = document.querySelector('meta[name="viewport"]');
    if (meta && !/viewport-fit/.test(meta.getAttribute('content') ?? '')) {
      meta.setAttribute('content', `${meta.getAttribute('content')}, viewport-fit=cover`);
    }

    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      html, body, #root {
        height: 100%;
        overflow: hidden;
        overscroll-behavior: none;
      }
      /*
       * iOS enlarges small text on its own, but the layout around it keeps the
       * original box — an 11px tab label grows past its 24px line box and gets
       * sliced by the overflow. UI chrome should render at the size it was
       * designed at; body copy is unaffected because none of it is set this small.
       */
      html {
        -webkit-text-size-adjust: 100%;
        text-size-adjust: 100%;
      }
      @supports (height: 100svh) {
        html, body, #root {
          height: 100svh;
          max-height: 100svh;
        }
      }
    `;
    document.head.appendChild(style);
  }, []);
}

/**
 * Browser crypto-wallet extensions inject a script into every page and some of
 * them throw while probing for a wallet — Brave's assigns to
 * `window.ethereum.selectedAddress` before that object exists. The failure has
 * nothing to do with this app, but an uncaught page error opens Expo's
 * full-screen error overlay and hides the UI on a phone.
 *
 * This swallows that one class of error and nothing else: anything thrown by
 * application code still surfaces normally.
 */
function useIgnoreWalletExtensionErrors() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const isWalletInjection = (message: string) =>
      /window\.ethereum|selectedAddress|ethereum is not defined|solana\.|web3/i.test(message);

    const onError = (event: ErrorEvent) => {
      if (isWalletInjection(event.message ?? '')) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = String((event.reason as { message?: string })?.message ?? event.reason ?? '');
      if (isWalletInjection(reason)) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    };

    // Capture phase, so this runs before the dev overlay's own handler.
    window.addEventListener('error', onError, true);
    window.addEventListener('unhandledrejection', onRejection, true);

    return () => {
      window.removeEventListener('error', onError, true);
      window.removeEventListener('unhandledrejection', onRejection, true);
    };
  }, []);
}

/**
 * Shown when a computer reaches the phone app and there is nowhere to send it.
 * Deliberately standalone — no theme, no providers — because it has to render
 * even when the rest of the app is not allowed to start.
 */
function WrongDevice() {
  // Known whenever the address is configured or this is a development host; a
  // refusal that cannot offer the way out says so rather than showing a dead
  // button.
  const workspace = desktopUrl();

  return (
    <View style={refusal.screen}>
      <Text style={refusal.title}>Snoopy Workplace is not available on this device</Text>
      <Text style={refusal.body}>
        This is the phone app. On a computer, use the Snoopy Workplace management
        workspace instead — it carries employees, reporting and everything this
        app deliberately leaves out.
      </Text>

      {workspace ? (
        <Pressable
          onPress={() => { window.location.href = workspace; }}
          style={({ pressed }) => [refusal.action, pressed && refusal.actionPressed]}
          accessibilityRole="button"
        >
          <Text style={refusal.actionLabel}>Open the workspace</Text>
        </Pressable>
      ) : (
        <Text style={refusal.hint}>
          Ask your workspace administrator for the workspace address.
        </Text>
      )}
    </View>
  );
}

const refusal = StyleSheet.create({
  screen: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, gap: 12, backgroundColor: '#f1eee6',
  },
  title: {
    fontSize: 22, fontWeight: '600', color: '#16150f',
    textAlign: 'center', lineHeight: 28, maxWidth: 420,
  },
  body: {
    fontSize: 15, color: '#5c584c', textAlign: 'center',
    lineHeight: 22, maxWidth: 420,
  },
  action: {
    marginTop: 6, paddingVertical: 12, paddingHorizontal: 22,
    borderRadius: 10, backgroundColor: '#b23a2e',
  },
  actionPressed: { opacity: 0.85 },
  actionLabel: { color: '#fffefb', fontSize: 15, fontWeight: '600' },
  hint: { fontSize: 13, color: '#857f70', textAlign: 'center', maxWidth: 420 },
});

function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  useWebViewportHeight();
  useEffect(setupProgressiveWebApp, []);
  useIgnoreWalletExtensionErrors();

  /*
   * This build is the phone app. A computer is sent to the management workspace
   * before anything else renders; when there is nowhere to send it, the refusal
   * is shown instead of the app. Native builds are phones by definition and
   * never reach either branch.
   */
  const [blocked, setBlocked] = useState(false);
  const [checked, setChecked] = useState(Platform.OS !== 'web');

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    setBlocked(enforceSurface());
    setChecked(true);
  }, []);

  // Nothing renders until the check has run, so the wrong app never flashes.
  if (!checked) return null;
  if (blocked) return <WrongDevice />;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <ThemedStatusBar />
          <Gate />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
