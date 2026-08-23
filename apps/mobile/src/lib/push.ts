import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Profile } from '@snoopy/shared';
import { supabase } from './supabase';

/**
 * Registering this device so reminders reach it when the app is shut.
 *
 * Everything here is best-effort. A phone that refuses notifications, a
 * simulator that has no push service, a web build with no service worker — none
 * of those are errors worth showing anybody, because the in-app notification
 * list is still there and still correct. Push is the extra path, never the
 * only one.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

/** Expo needs the project id to mint a token that its push service will accept. */
function projectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId
    ?? (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId
  );
}

export async function registerForPush(profile: Profile): Promise<string | null> {
  // A simulator has no push service, and asking it for a token throws.
  if (!Device.isDevice || Platform.OS === 'web') return null;

  try {
    const existing = await Notifications.getPermissionsAsync();
    const granted = existing.granted
      ? true
      : (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Reminders',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });

    /*
     * Upserted on the token, not on the person: the operating system rotates
     * tokens without warning and hands a reused one to whoever signs in next,
     * so the row follows the device and its owner is whoever is signed in now.
     */
    await supabase.from('push_tokens').upsert({
      organisation_id: profile.organisation_id,
      user_id: profile.id,
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'token' });

    return token;
  } catch {
    // Push is a convenience. Failing to arrange it must never break sign in.
    return null;
  }
}

/** Stops this device receiving reminders for somebody who has signed out. */
export async function forgetThisDevice(): Promise<void> {
  if (!Device.isDevice || Platform.OS === 'web') return;
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
    await supabase.from('push_tokens').delete().eq('token', token);
  } catch {
    // Nothing to do: an unreachable backend on sign out is not worth a dialog.
  }
}
