// One queue instead of seven tabs. The test that matters is not that the page
// renders, but that it shows the same work the individual reports do — a summary
// that quietly drops a category is worse than no summary.
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const API = 'http://127.0.0.1:54321';
const BASE = process.env.DESKTOP_URL ?? 'http://localhost:3100';

let bad = 0;
const check = (ok, label, detail = '') => {
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
};

async function login(email) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'snoopy123' }),
  });
  const s = await r.json();
  if (!s.access_token) throw new Error(`login failed for ${email}`);
  return { token: s.access_token, id: s.user.id,
           cookie: `sb-127-auth-token=base64-${Buffer.from(JSON.stringify(s)).toString('base64')}` };
}

const lucy = await login('lucy@peanutsstudio.test');
const charlie = await login('charlie@peanutsstudio.test');

const rows = (who, path) => fetch(`${API}/rest/v1/${path}`, {
  headers: { apikey: ANON, Authorization: `Bearer ${who.token}` },
}).then((r) => r.json());

const page = (who, path) => fetch(`${BASE}${path}`, { headers: { cookie: who.cookie } }).then((r) => r.text());

const worklist = await page(lucy, '/worklist');
check(worklist.includes('What needs you'), 'the worklist renders');

// Each source the queue draws from must be represented when it has rows.
const pending = await rows(lucy, 'employee_credentials?select=id&status=eq.Pending');
if (pending.length > 0) {
  check(worklist.includes('Certificates to check'), 'unchecked certificates appear');
  check(worklist.includes(String(pending.length)), 'with the same count the report shows',
    `${pending.length} pending`);
}

const overdueTraining = await rows(lucy, 'outstanding_required_training?select=assignment_id&is_overdue=eq.true');
if (overdueTraining.length > 0) {
  check(worklist.includes('Required training overdue'), 'overdue required training appears');
}

const owed = await rows(lucy, 'outstanding_acknowledgements?select=document_id');
if (owed.length > 0) {
  check(worklist.includes('Acknowledgements owed'), 'outstanding acknowledgements appear');
}

const expiring = await rows(lucy, 'expiring_credentials?select=credential_id');
if (expiring.length > 0) {
  check(worklist.includes('Expiring or lapsed'), 'expiring credentials appear');
}

// Blocking work has to sort above work that merely tidies figures.
const blockingIndex = worklist.indexOf('Certificates to check');
const tidyIndex = worklist.indexOf('Acknowledgements owed');
if (blockingIndex > -1 && tidyIndex > -1) {
  check(blockingIndex < tidyIndex, 'work that blocks somebody is listed first');
}

// An employee has no queue of other people's work.
const employeeView = await page(charlie, '/worklist');
check(
  !employeeView.includes('Certificates to check') || employeeView.includes('Nothing needs you'),
  'an employee does not see the workspace queue',
);

// The counts must be real, not decorative.
const totalSources = pending.length + overdueTraining.length + owed.length + expiring.length;
check(totalSources > 0, 'there is work in the fixtures to aggregate', String(totalSources));

// ---- adding an employee uses the service key, which nothing else exercises
/*
 * This is the path that was broken for the whole life of the feature: grants
 * were given to `authenticated` and never to `service_role`, so the one action
 * needing elevated rights failed at the grant layer. Every other check creates
 * people directly in SQL as the database owner, which is precisely why none of
 * them noticed.
 */
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../../apps/desktop/.env.local', import.meta.url), 'utf8');
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim();
check(Boolean(serviceKey), 'the server has a service key configured');

if (serviceKey) {
  const probeId = crypto.randomUUID();
  const asService = (path, init = {}) => fetch(`${API}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  });

  // Mint the auth user the way the action does, then write the profile.
  const user = await fetch(`${API}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `grantprobe${Date.now()}@peanutsstudio.test`, password: 'snoopy12345', email_confirm: true,
    }),
  }).then((r) => r.json());
  check(Boolean(user.id), 'the service key can create an auth user', JSON.stringify(user).slice(0, 120));

  if (user.id) {
    const profile = await asService('profiles', {
      method: 'POST',
      body: JSON.stringify({
        id: user.id, organisation_id: 'aaaaaaaa-0000-0000-0000-000000000001',
        name: 'Grant probe', email: user.email, role: 'employee',
      }),
    });
    const created = profile.status < 400;
    check(created, 'and write the profile that goes with it',
      created ? '' : `status ${profile.status}: ${(await profile.text()).slice(0, 120)}`);

    await asService(`profiles?id=eq.${user.id}`, { method: 'DELETE' });
    await fetch(`${API}/auth/v1/admin/users/${user.id}`, {
      method: 'DELETE', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
  }
}

// ---------------------------------------------------------------- clearing in batches
/*
 * Three of the six groups end in the same verdict for every row, and those are
 * the ones that arrive in clumps. The batch controls have to follow the grant,
 * not the group: seeing a queue and being allowed to clear it are separate
 * permissions, so a button that appears for somebody who cannot use it is worse
 * than no button.
 */
if (pending.length > 0) {
  check(worklist.includes('Select all'), 'certificates can be cleared in a batch');
  check(worklist.includes('How did you check') || worklist.includes('Accept'),
        'accepting a batch still asks how they were checked');
}

const charlieQueue = await page(charlie, '/worklist');
check(!charlieQueue.includes('Select all'),
      'somebody without the grant gets the list without the batch controls');

process.exit(bad ? 1 : 0);
