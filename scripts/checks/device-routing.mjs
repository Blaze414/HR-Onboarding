// Each app is only usable on the device class it was built for. These are real
// user agent strings; the same function decides for both apps, which is what
// guarantees a visitor is redirected at most once rather than bounced forever.
import http from 'node:http';

import { decideSurface, surfaceFor } from '../../packages/shared/src/surface.ts';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/604.1';
const ANDROID_TABLET = 'Mozilla/5.0 (Linux; Android 14; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

let bad = 0;
const check = (ok, label, detail = '') => {
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
};

for (const [ua, expected, name] of [
  [IPHONE, 'mobile', 'iPhone'],
  [ANDROID, 'mobile', 'Android phone'],
  [IPAD, 'desktop', 'iPad'],
  [ANDROID_TABLET, 'desktop', 'Android tablet'],
  [MAC, 'desktop', 'Mac'],
  [WINDOWS, 'desktop', 'Windows'],
  [null, 'desktop', 'an unknown client'],
]) {
  check(surfaceFor(ua) === expected, `${name} belongs on ${expected}`, surfaceFor(ua));
}

const MOBILE_URL = 'https://app.example.com';
const DESKTOP_URL = 'https://work.example.com';

// A phone on the workspace is sent away; a computer there is left alone.
check(
  decideSurface({ current: 'desktop', userAgent: IPHONE, otherAppUrl: MOBILE_URL }).action === 'redirect',
  'a phone is redirected off the workspace',
);
check(
  decideSurface({ current: 'desktop', userAgent: MAC, otherAppUrl: MOBILE_URL }).action === 'allow',
  'a computer stays on the workspace',
);
check(
  decideSurface({ current: 'mobile', userAgent: MAC, otherAppUrl: DESKTOP_URL }).action === 'redirect',
  'a computer is redirected off the phone app',
);
check(
  decideSurface({ current: 'mobile', userAgent: IPHONE, otherAppUrl: DESKTOP_URL }).action === 'allow',
  'a phone stays on the phone app',
);

// The redirect must carry the hop marker, or the two apps would bounce forever.
const hop = decideSurface({ current: 'desktop', userAgent: IPHONE, otherAppUrl: MOBILE_URL });
check(hop.action === 'redirect' && hop.url.includes('sw=1'), 'the redirect marks itself', hop.url);

// A second hop refuses rather than loops.
check(
  decideSurface({ current: 'desktop', userAgent: IPHONE, otherAppUrl: MOBILE_URL, alreadyRedirected: true }).action === 'block',
  'a second hop is refused, never looped',
);

// No configured address means refuse, not quietly allow — otherwise a missing
// environment variable would silently disable the whole rule.
check(
  decideSurface({ current: 'desktop', userAgent: IPHONE, otherAppUrl: null }).action === 'block',
  'an unconfigured address refuses rather than admits',
);

// Round trip: whatever one app rejects, the other must accept.
for (const [ua, name] of [[IPHONE, 'iPhone'], [MAC, 'Mac'], [IPAD, 'iPad']]) {
  const onDesktop = decideSurface({ current: 'desktop', userAgent: ua, otherAppUrl: MOBILE_URL }).action;
  const onMobile = decideSurface({ current: 'mobile', userAgent: ua, otherAppUrl: DESKTOP_URL }).action;
  check(
    [onDesktop, onMobile].filter((a) => a === 'allow').length === 1,
    `${name} is accepted by exactly one app`,
    `desktop:${onDesktop} mobile:${onMobile}`,
  );
}

// ---- the refusal page must offer a way out whenever one is knowable
const PORT = process.env.DESKTOP_PORT ?? '3100';

// node:http rather than fetch: fetch treats Host as a forbidden header and
// drops it silently, so every request would arrive as localhost and the
// production-domain case below could never be exercised.
const page = (host) =>
  new Promise((resolve, reject) => {
    const request = http.request(
      { host: 'localhost', port: PORT, path: '/login', headers: { 'user-agent': IPHONE, host } },
      (response) => {
        let body = '';
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => resolve(body));
      },
    );
    request.on('error', reject);
    request.end();
  });

try {
  const onDevHost = await page(`localhost:${PORT}`);
  check(
    onDevHost.includes('Open the companion app') && /href="http:\/\/localhost:8081"/.test(onDevHost),
    'a refused phone on a dev host is offered the companion app',
  );

  // On a real domain the port guess would be a dead link, so the button must
  // not appear at all — a button that goes nowhere is worse than none.
  const onRealHost = await page('workspace.example.com');
  check(
    !onRealHost.includes('Open the companion app')
      && onRealHost.includes('Ask your workspace administrator'),
    'no dead button is shown when the address is unknown',
  );
} catch (error) {
  check(false, 'the refusal page could be reached', String(error.message));
}

process.exit(bad ? 1 : 0);
