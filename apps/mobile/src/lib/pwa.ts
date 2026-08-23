import { Platform } from 'react-native';

/**
 * Wires up the pieces that make the web build installable: the manifest, the
 * icons iOS looks for, a theme colour per colour scheme, and the service worker.
 *
 * The worker is registered in production builds only. In development the bundle
 * changes constantly and a cached shell is how you end up staring at code you
 * replaced ten minutes ago.
 */
export function setupProgressiveWebApp() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;

  const head = document.head;

  const link = (rel: string, href: string, extra: Record<string, string> = {}) => {
    if (head.querySelector(`link[rel="${rel}"][href="${href}"]`)) return;
    const el = document.createElement('link');
    el.rel = rel;
    el.href = href;
    Object.entries(extra).forEach(([key, value]) => el.setAttribute(key, value));
    head.appendChild(el);
  };

  const meta = (name: string, content: string, media?: string) => {
    const selector = media
      ? `meta[name="${name}"][media="${media}"]`
      : `meta[name="${name}"]`;
    if (head.querySelector(selector)) return;
    const el = document.createElement('meta');
    el.name = name;
    el.content = content;
    if (media) el.setAttribute('media', media);
    head.appendChild(el);
  };

  link('manifest', '/manifest.json');
  link('apple-touch-icon', '/icons/apple-touch-icon.png');
  link('icon', '/favicon.png');

  // Paints the status bar area to match whichever theme the device is using,
  // so an installed window does not show a strip of the wrong colour.
  meta('theme-color', '#f1eee6', '(prefers-color-scheme: light)');
  meta('theme-color', '#16150f', '(prefers-color-scheme: dark)');

  // iOS predates the manifest and still reads these.
  meta('apple-mobile-web-app-capable', 'yes');
  meta('apple-mobile-web-app-status-bar-style', 'black-translucent');
  meta('apple-mobile-web-app-title', 'Snoopy');
  meta('mobile-web-app-capable', 'yes');

  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction || !('serviceWorker' in navigator) || !window.isSecureContext) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('[pwa] service worker registration failed:', error);
    });
  });
}

/** True when running from the home screen rather than a browser tab. */
export function isInstalled(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
    || window.matchMedia('(display-mode: standalone)').matches;
}
