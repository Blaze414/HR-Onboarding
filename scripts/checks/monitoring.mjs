// Watching the workspace, and watching the watchers.
//
// A Super Administrator can see every sign in and every change in their own
// workspace, because that is the role that answers to the OAIC and to the
// people affected when something goes wrong. Three things have to hold for
// that to be an investigative power rather than a surveillance one:
//
//   * The record is written by the database, not by the app, so it cannot be
//     avoided by reaching the data another way — and cannot be amended after
//     the fact by anybody at all.
//   * An ordinary admin cannot read it. They are the population it exists to
//     hold to account.
//   * Reading it is itself recorded, with a reason, where the people being
//     looked at can see it.
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const API = 'http://127.0.0.1:54321';
const CHARLIE = '11111111-1111-1111-1111-000000000002';

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
  if (!s.access_token) throw new Error(`login failed for ${email}: ${JSON.stringify(s)}`);
  return { token: s.access_token, id: s.user.id };
}

const rest = (who, path, init = {}) => fetch(`${API}/rest/v1/${path}`, {
  ...init,
  headers: {
    apikey: ANON, Authorization: `Bearer ${who.token}`,
    'Content-Type': 'application/json', Prefer: 'return=representation',
    ...init.headers,
  },
});
const rpc = (who, fn, args) => rest(who, `rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });

const lucy = await login('lucy@peanutsstudio.test');       // Super Administrator
const marcie = await login('marcie@peanutsstudio.test');   // ordinary admin
const charlie = await login('charlie@peanutsstudio.test'); // employee
const sally = await login('sally@woodstockdigital.test');  // other workspace

// ------------------------------------------------------ the database records it
const before = await rest(lucy, 'audit_log?select=id&limit=1').then((r) => r.json());
check(Array.isArray(before), 'a Super Administrator can read the audit trail',
  JSON.stringify(before).slice(0, 120));

// A change made straight against the API, with no application code involved.
await rest(lucy, `profiles?id=eq.${CHARLIE}`, {
  method: 'PATCH', body: JSON.stringify({ job_title: 'Monitoring check title' }),
});
const recorded = await rest(lucy, `audit_log?select=actor_id,subject_id,entity,action,changes&entity=eq.profiles&order=at.desc&limit=1`)
  .then((r) => r.json()).then((rows) => rows?.[0]);

check(recorded?.actor_id === lucy.id, 'a change made outside the app is still recorded',
  JSON.stringify(recorded).slice(0, 160));
check(recorded?.subject_id === CHARLIE, 'against the person it was about', recorded?.subject_id);
check(recorded?.changes?.job_title?.to === 'Monitoring check title',
  'with the field, the old value and the new one', JSON.stringify(recorded?.changes).slice(0, 160));

// A write that changes nothing is not an event.
const countBefore = await rest(lucy, 'audit_log?select=id&entity=eq.profiles')
  .then((r) => r.json()).then((r) => r.length);
await rest(lucy, `profiles?id=eq.${CHARLIE}`, {
  method: 'PATCH', body: JSON.stringify({ job_title: 'Monitoring check title' }),
});
const countAfter = await rest(lucy, 'audit_log?select=id&entity=eq.profiles')
  .then((r) => r.json()).then((r) => r.length);
check(countAfter === countBefore, 'an update that changed nothing is not recorded',
  `${countBefore} -> ${countAfter}`);

// ------------------------------------------------------------- who may read it
/*
 * An ordinary admin is not a reader of this record — they are one of the
 * people it exists to hold to account. They see exactly what everybody else
 * sees: what was done to them, and nothing about anybody else. That their own
 * rows are visible is the point, not an exception.
 */
const asAdmin = await rest(marcie, 'audit_log?select=subject_id').then((r) => r.json());
check(Array.isArray(asAdmin) && asAdmin.every((r) => r.subject_id === marcie.id),
  'an ordinary admin sees only what was done to them, like anybody else',
  JSON.stringify((asAdmin ?? []).filter((r) => r.subject_id !== marcie.id)).slice(0, 120));

const adminOnCharlie = await rest(marcie, `audit_log?select=id&subject_id=eq.${CHARLIE}`)
  .then((r) => r.json());
check(Array.isArray(adminOnCharlie) && adminOnCharlie.length === 0,
  'and nothing about a colleague, even one they can edit',
  JSON.stringify(adminOnCharlie).slice(0, 120));

const asEmployee = await rest(charlie, 'audit_log?select=subject_id').then((r) => r.json());
check(Array.isArray(asEmployee) && asEmployee.length > 0,
  'an employee sees what was done to them');
check(asEmployee.every((r) => r.subject_id === charlie.id),
  'and nothing that was done to anybody else',
  JSON.stringify(asEmployee.filter((r) => r.subject_id !== charlie.id)).slice(0, 120));

const acrossWorkspaces = await rest(sally, `audit_log?select=id&subject_id=eq.${CHARLIE}`)
  .then((r) => r.json());
check(Array.isArray(acrossWorkspaces) && acrossWorkspaces.length === 0,
  'a Super Administrator of another workspace sees nothing here',
  JSON.stringify(acrossWorkspaces).slice(0, 120));

// ------------------------------------------------------------- it cannot be edited
const forge = await rest(lucy, 'audit_log', {
  method: 'POST',
  body: JSON.stringify({ action: 'updated', entity: 'profiles', actor_id: CHARLIE }),
});
check(forge.status >= 400, 'nobody can add an entry by hand', `status ${forge.status}`);

const amend = await rest(lucy, `audit_log?entity=eq.profiles`, {
  method: 'PATCH', body: JSON.stringify({ actor_id: CHARLIE }),
});
check(amend.status >= 400, 'or pin a change on somebody else afterwards', `status ${amend.status}`);

const erase = await rest(lucy, `audit_log?entity=eq.profiles`, { method: 'DELETE' });
check(erase.status >= 400, 'or remove one', `status ${erase.status}`);

// -------------------------------------------------- sign-ins across the workspace
const everyones = await rest(lucy, 'sign_in_events?select=user_id').then((r) => r.json());
check(Array.isArray(everyones) && new Set(everyones.map((r) => r.user_id)).size > 1,
  'a Super Administrator sees more than their own sign-ins',
  `${new Set((everyones ?? []).map((r) => r.user_id)).size} accounts`);

const adminSignIns = await rest(marcie, 'sign_in_events?select=user_id').then((r) => r.json());
check(Array.isArray(adminSignIns) && adminSignIns.every((r) => r.user_id === marcie.id),
  'an ordinary admin still sees only their own');

const otherWorkspace = await rest(sally, `sign_in_events?select=id&user_id=eq.${lucy.id}`)
  .then((r) => r.json());
check(Array.isArray(otherWorkspace) && otherWorkspace.length === 0,
  'and no Super Administrator reaches another workspace');

// ------------------------------------------------------- watching the watchers
const noReason = await rpc(lucy, 'record_sign_in_log_read', { why: '   ' });
check(noReason.status >= 400, 'looking without saying why is refused', `status ${noReason.status}`);

const notAllowed = await rpc(marcie, 'record_sign_in_log_read', { why: 'curious' });
check(notAllowed.status >= 400, 'and an ordinary admin cannot even record a look',
  `status ${notAllowed.status}`);

const look = await rpc(lucy, 'record_sign_in_log_read', {
  why: 'Monitoring check', subject: CHARLIE,
});
check(look.status < 400, 'a Super Administrator records why they looked', `status ${look.status}`);

const seenByCharlie = await rest(charlie, 'sign_in_log_reads?select=reason').then((r) => r.json());
check(Array.isArray(seenByCharlie) && seenByCharlie.some((r) => r.reason === 'Monitoring check'),
  'and the person looked at can see that they were looked at',
  JSON.stringify(seenByCharlie).slice(0, 140));

const notSeenByMarcie = await rest(marcie, 'sign_in_log_reads?select=reason').then((r) => r.json());
check(Array.isArray(notSeenByMarcie) && notSeenByMarcie.length === 0,
  'somebody who was not looked at sees nothing');

// ------------------------------------------------------- describing a sign in
const mislabel = await rpc(charlie, 'describe_my_sign_in', {
  client_name: 'Phone app', device_name: 'iOS 18', zone_name: 'Australia/Brisbane',
});
check(mislabel.status < 400, 'an app can say which app it is', `status ${mislabel.status}`);

const mine = await rest(charlie, 'sign_in_events?select=client,time_zone&order=at.desc&limit=1')
  .then((r) => r.json()).then((rows) => rows?.[0]);
check(mine?.client === 'Phone app' && mine?.time_zone === 'Australia/Brisbane',
  'and the history records both, including the clock the device is set to',
  JSON.stringify(mine));

// Describing is one-shot: a second call cannot relabel a described row.
await rpc(charlie, 'describe_my_sign_in', {
  client_name: 'Web workspace', device_name: 'Chrome', zone_name: 'Europe/London',
});
const unchanged = await rest(charlie, 'sign_in_events?select=client&order=at.desc&limit=1')
  .then((r) => r.json()).then((rows) => rows?.[0]);
check(unchanged?.client === 'Phone app', 'and a described sign in cannot be relabelled later',
  unchanged?.client);

const notMine = await rest(charlie, `sign_in_events?select=client&user_id=eq.${lucy.id}`)
  .then((r) => r.json());
check(Array.isArray(notMine) && notMine.length === 0,
  'nobody can describe, or even see, somebody else’s sign in');

process.exit(bad === 0 ? 0 : 1);
