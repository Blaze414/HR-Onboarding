// Nothing is trusted because of where it came from.
//
// The three Zero Trust claims this app makes, each tested the only way worth
// testing them — by trying to get past them rather than by reading the code:
//
//   Verify explicitly     Every request re-proves who is asking. A session is
//                         not evidence of anything on its own, and the browser
//                         is not asked to report its own failures.
//   Least privilege       Editing somebody's details and granting them access
//                         are different permissions, and a patch cannot carry
//                         fields that decide ownership.
//   Assume breach         The page itself is treated as a place code might run:
//                         it cannot be framed, and it cannot fetch from or ship
//                         data to anywhere it likes.
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const API = 'http://127.0.0.1:54321';
const APP = 'http://localhost:3100';

let bad = 0;
const check = (ok, label, detail = '') => {
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
};

/*
 * A development server drops the occasional connection while it recompiles, and
 * this check deliberately hammers one route six times in a row. A socket reset
 * is not a security finding; failing the whole group on one is how a suite
 * teaches people to ignore it.
 */
async function post(url, body, attempts = 3) {
  for (let i = 1; ; i += 1) {
    try {
      return await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (thrown) {
      if (i >= attempts) throw thrown;
      await new Promise((r) => setTimeout(r, 250 * i));
    }
  }
}

const signIn = (email, password) => post(`${APP}/api/auth/sign-in`, { email, password });

// ------------------------------------------------------------ assume breach
const page = await fetch(`${APP}/login`);
const csp = page.headers.get('content-security-policy') ?? '';
check(/frame-ancestors 'none'/.test(csp), 'the workspace cannot be framed by another site', csp.slice(0, 80));
check(page.headers.get('x-frame-options') === 'DENY', 'and says so twice, for older browsers');
check(/object-src 'none'/.test(csp), 'plugins cannot be embedded');
check(/base-uri 'self'/.test(csp), 'a base tag cannot re-point every relative URL');
check(/form-action 'self'/.test(csp), 'a form cannot post somewhere else');
check(page.headers.get('x-content-type-options') === 'nosniff', 'responses are taken at their declared type');
check(/strict-origin/.test(page.headers.get('referrer-policy') ?? ''),
  'internal paths are not leaked in the referrer');
check(/camera=\(\)/.test(page.headers.get('permissions-policy') ?? ''),
  'the page cannot ask for a camera it never needs');

// -------------------------------------------------------- verify explicitly
const anonymous = await fetch(`${APP}/employees`, { redirect: 'manual' });
check(anonymous.status === 307 || anonymous.status === 302,
  'a workspace page is not served without a session', `status ${anonymous.status}`);

// A session is not proof of authorisation — the database is asked every time.
const charlie = await fetch(`${API}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'charlie@peanutsstudio.test', password: 'snoopy123' }),
}).then((r) => r.json());
check(Boolean(charlie.access_token), 'an employee can sign in');

const otherOrg = await fetch(`${API}/rest/v1/profiles?select=id&organisation_id=eq.bbbbbbbb-0000-0000-0000-000000000001`, {
  headers: { apikey: ANON, Authorization: `Bearer ${charlie.access_token}` },
}).then((r) => r.json());
check(Array.isArray(otherOrg) && otherOrg.length === 0,
  'a valid session reaches nothing in another workspace', JSON.stringify(otherOrg).slice(0, 100));

const forged = await fetch(`${API}/rest/v1/profiles?select=id`, {
  headers: { apikey: ANON, Authorization: `Bearer ${charlie.access_token.slice(0, -4)}xxxx` },
});
check(forged.status === 401, 'a tampered token is refused, not merely ignored', `status ${forged.status}`);

// ---------------------------------------------------- the sign-in front door
//
/*
 * Two accounts get locked out here, and both are chosen for the same reason: no
 * other check signs in as them, so leaving them locked for fifteen minutes
 * costs nothing. This matters more than it sounds — the first version of this
 * check locked out an account the next group signed in as, and the next group
 * died on a 429. The lockout was right; the checks were fighting each other.
 */
const LOCKED = 'pigpen@woodstockdigital.test';      // straight at the auth service
const LOCKED_VIA_APP = 'linus@woodstockdigital.test'; // through the web route

const direct = async (email, password) => {
  for (let i = 1; ; i += 1) {
    try {
      return await fetch(`${API}/auth/v1/token?grant_type=password`, {
        method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch (thrown) {
      if (i >= 3) throw thrown;
      await new Promise((r) => setTimeout(r, 250 * i));
    }
  }
};

const straight = [];
for (let i = 0; i < 6; i += 1) straight.push((await direct(LOCKED, 'not-the-password')).status);
check(straight.slice(0, 5).every((s) => s === 400),
  'a wrong password is refused by the auth service', straight.join(','));
check(straight[5] === 429,
  'and going straight to the auth service does not skip the limit — the phone app is covered',
  straight.join(','));

const lockedOut = await direct(LOCKED, 'snoopy123');
check(lockedOut.status === 429, 'the correct password does not lift the lockout either',
  `status ${lockedOut.status}`);

// Pig-Pen's colleague in the same workspace is untouched by his lockout.
const bystander = await direct('sally@woodstockdigital.test', 'snoopy123');
check(bystander.status === 200, 'and the limit is per account, not per workspace',
  `status ${bystander.status}`);

// The same limit reached through the web route, which adds nothing to it.
const viaApp = [];
for (let i = 0; i < 6; i += 1) viaApp.push((await signIn(LOCKED_VIA_APP, 'not-the-password')).status);
check(viaApp.slice(0, 5).every((s) => s === 401), 'the web route refuses a wrong password', viaApp.join(','));
check(viaApp[5] === 429, 'and reports the same lockout rather than counting separately', viaApp.join(','));

const unknown = [];
const nobody = `zerotrust-${Date.now()}@peanutsstudio.test`;
for (let i = 0; i < 6; i += 1) unknown.push((await signIn(nobody, 'not-the-password')).status);
check(unknown.every((s) => s === 401),
  'an address nobody works under accumulates nothing — no account to protect, no list to read',
  unknown.join(','));

const message = await signIn(nobody, 'not-the-password').then((r) => r.json());
check(!/no user|not found|unknown/i.test(message.error ?? ''),
  'the refusal does not say whether the address exists', message.error);

const goodSignIn = await signIn('patty@peanutsstudio.test', 'snoopy123');
check(goodSignIn.status === 200, 'a correct password still gets in', `status ${goodSignIn.status}`);
check(/sb-.*-auth-token/.test(goodSignIn.headers.get('set-cookie') ?? ''),
  'and the session is issued by the server, not assembled in the browser');

// The attempts were recorded where the browser cannot reach them.
const patty = await fetch(`${API}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'patty@peanutsstudio.test', password: 'snoopy123' }),
}).then((r) => r.json());

const own = await fetch(`${API}/rest/v1/sign_in_events?select=succeeded,user_id`, {
  headers: { apikey: ANON, Authorization: `Bearer ${patty.access_token}` },
}).then((r) => r.json());
check(Array.isArray(own) && own.length > 0, 'somebody can see their own sign-ins',
  JSON.stringify(own).slice(0, 100));
check(Array.isArray(own) && own.every((r) => r.user_id === patty.user.id),
  'and only their own');

const nosy = await fetch(`${API}/rest/v1/sign_in_events?select=email&email=eq.${LOCKED}`, {
  headers: { apikey: ANON, Authorization: `Bearer ${patty.access_token}` },
}).then((r) => r.json());
check(Array.isArray(nosy) && nosy.length === 0,
  'nobody can look up whether an address has been attacked', JSON.stringify(nosy).slice(0, 100));

const forge = await fetch(`${API}/rest/v1/sign_in_events`, {
  method: 'POST',
  headers: {
    apikey: ANON, Authorization: `Bearer ${patty.access_token}`,
    'Content-Type': 'application/json', Prefer: 'return=representation',
  },
  body: JSON.stringify({ email: 'patty@peanutsstudio.test', succeeded: true }),
});
check(forge.status >= 400, 'and a session cannot write a sign-in that never happened',
  `status ${forge.status}`);

const erase = await fetch(`${API}/rest/v1/sign_in_events?user_id=eq.${patty.user.id}`, {
  method: 'DELETE', headers: { apikey: ANON, Authorization: `Bearer ${patty.access_token}` },
});
check(erase.status >= 400, 'or remove one that did', `status ${erase.status}`);

// The hook decides whether a sign in proceeds and writes to an append-only
// log. A session that could call it directly could fabricate attempts, or lock
// somebody out of their own account.
const invoke = await fetch(`${API}/rest/v1/rpc/password_verification_attempt`, {
  method: 'POST',
  headers: {
    apikey: ANON, Authorization: `Bearer ${patty.access_token}`, 'Content-Type': 'application/json',
  },
  body: JSON.stringify({ event: { user_id: patty.user.id, valid: false } }),
});
check(invoke.status >= 400, 'and cannot call the hook that records them', `status ${invoke.status}`);

/*
 * Where each half of a row comes from: the auth hook writes the attempt for
 * every client, and the web route fills in the origin afterwards, because a
 * database function invoked by the auth service cannot see the network. A
 * sign in that never went through the web app therefore has no origin — which
 * is what a sign in from the phone app looks like.
 */
const patties = await fetch(`${API}/rest/v1/sign_in_events?select=ip,at&order=at.desc`, {
  headers: { apikey: ANON, Authorization: `Bearer ${patty.access_token}` },
}).then((r) => r.json());
check(patties.some((r) => r.ip !== null), 'a sign in through the web app records where it came from',
  JSON.stringify(patties).slice(0, 120));
check(patties.some((r) => r.ip === null), 'and one that did not go through it is still recorded',
  JSON.stringify(patties).slice(0, 120));

process.exit(bad === 0 ? 0 : 1);
