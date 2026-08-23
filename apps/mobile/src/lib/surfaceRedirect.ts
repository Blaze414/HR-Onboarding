import { decideSurface, SURFACE_HOP_PARAM, type SurfaceDecision } from '@snoopy/shared';

/**
 * Keeps this build on phones.
 *
 * The mirror of the check in the desktop app's middleware. A static export has
 * no server, so this runs on the client and must run before anything paints.
 * Both apps decide with the same function, so a visitor is redirected at most
 * once; if a second hop is ever attempted it is refused rather than looped.
 */
export function surfaceDecision(): SurfaceDecision {
  if (typeof window === 'undefined') return { action: 'allow' };
  return decideSurface({
    current: 'mobile',
    userAgent: window.navigator.userAgent,
    otherAppUrl: desktopUrl(),
    alreadyRedirected: new URLSearchParams(window.location.search).has(SURFACE_HOP_PARAM),
  });
}

/** Acts on the decision. Returns true when the app should not render. */
export function enforceSurface(): boolean {
  const decision = surfaceDecision();
  if (decision.action === 'redirect') {
    window.location.replace(decision.url);
    return true;
  }
  return decision.action === 'block';
}

/**
 * A deployment sets the address explicitly. The dev-port guess is only valid on
 * a development host, so on a real domain an unset variable means there is
 * nowhere to send anyone — which the decision treats as a refusal, not as
 * permission to stay.
 */
export function desktopUrl(): string | null {
  const configured = process.env.EXPO_PUBLIC_DESKTOP_APP_URL;
  if (configured) return configured.replace(/\/$/, '');
  if (typeof window === 'undefined') return null;
  const host = window.location.hostname;
  const isDevHost = host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host);
  return isDevHost ? `${window.location.protocol}//${host}:3100` : null;
}
