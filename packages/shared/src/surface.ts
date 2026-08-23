/**
 * Which client a device is allowed to use.
 *
 * The two apps are separate products, not one responsive layout, and each is
 * only usable on the device class it was built for. A phone is therefore sent
 * to the companion app and a computer to the management workspace — this is
 * enforcement, not a suggestion, so there is deliberately no override.
 *
 * Both apps decide with this one function, which is what keeps them from
 * disagreeing: if the desktop app thinks a device is a phone, the mobile app
 * thinks so too, so a visitor is redirected at most once.
 */
export type Surface = 'desktop' | 'mobile';

/**
 * Marks a request that has already been redirected once. Two apps that each
 * believe the other is correct would bounce a visitor forever; this makes that
 * failure visible and finite instead of infinite.
 */
export const SURFACE_HOP_PARAM = 'sw';

/**
 * Phones only. Tablets are treated as computers: the management workspace is
 * usable at that size, and the companion app is not designed to fill it.
 */
const PHONE = /Android.*Mobile|iPhone|iPod|Windows Phone|BlackBerry|BB10|Opera Mini|IEMobile|Mobile.*Firefox/i;
const TABLET = /iPad|Android(?!.*Mobile)|Tablet|Silk|PlayBook/i;

export function isPhoneUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  if (TABLET.test(userAgent)) return false;
  return PHONE.test(userAgent);
}

/** The only surface this device may use. */
export function surfaceFor(userAgent: string | null | undefined): Surface {
  return isPhoneUserAgent(userAgent) ? 'mobile' : 'desktop';
}

export type SurfaceDecision =
  | { action: 'allow' }
  /** Send them to the app for their device. */
  | { action: 'redirect'; url: string }
  /**
   * They are on the wrong app and there is nowhere to send them — either the
   * other app's address is unconfigured, or a redirect already happened and did
   * not settle. Refusing is the honest outcome: silently allowing would defeat
   * the rule, and redirecting again would loop.
   */
  | { action: 'block'; wanted: Surface };

export function decideSurface({
  current, userAgent, otherAppUrl, alreadyRedirected,
}: {
  current: Surface;
  userAgent: string | null | undefined;
  otherAppUrl?: string | null;
  alreadyRedirected?: boolean;
}): SurfaceDecision {
  const wanted = surfaceFor(userAgent);
  if (wanted === current) return { action: 'allow' };
  if (alreadyRedirected || !otherAppUrl) return { action: 'block', wanted };
  const base = otherAppUrl.replace(/\/$/, '');
  return { action: 'redirect', url: `${base}/?${SURFACE_HOP_PARAM}=1` };
}
