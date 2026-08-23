import AsyncStorage from '@react-native-async-storage/async-storage';
import { createSupabaseClient, resolveBackendUrl } from '@snoopy/shared';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

/**
 * Where this device can actually reach the backend.
 *
 * On web that is the host the page was served from. On a real phone there is no
 * page host, so the packager's address is used instead: Expo already told the
 * device where to fetch the bundle, and in a dev setup the backend lives on that
 * same machine. Without this a phone dials its own loopback and every request
 * fails before leaving the device.
 */
function deviceHost(): string | null {
  if (Platform.OS === 'web') {
    return typeof window === 'undefined' ? null : window.location.hostname;
  }
  const hostUri =
    Constants.expoConfig?.hostUri
    ?? (Constants.expoGoConfig as { debuggerHost?: string } | undefined)?.debuggerHost
    ?? null;
  return hostUri ? hostUri.split(':')[0] : null;
}

/**
 * One client for the app. Sessions persist in AsyncStorage — which is
 * localStorage on web — so the app opens signed in. URL session detection stays
 * off: there is no OAuth redirect to parse in this POC.
 */
/** The address this device resolved for the backend, shown when sign in fails. */
export const backendUrl = resolveBackendUrl(process.env.EXPO_PUBLIC_SUPABASE_URL ?? '', deviceHost());

export const supabase = createSupabaseClient({
  url: backendUrl,
  anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  storage: AsyncStorage,
  detectSessionInUrl: false,
});
