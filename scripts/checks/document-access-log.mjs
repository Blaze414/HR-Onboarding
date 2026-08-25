// Who opened somebody else's file.
//
// The control is not "who may read" — that is unchanged — but "was it recorded,
// and can the subject see it". These checks prove a read of somebody's personal
// document is logged, that reading your own file and reading a shared document
// are not, that the subject sees the entry, that a colleague sees nothing, and
// that nobody can write to or tidy up the log.
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const API = 'http://127.0.0.1:54321';
const ORG = 'aaaaaaaa-0000-0000-0000-000000000001';

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

const lucy = await login('lucy@peanutsstudio.test');
const charlie = await login('charlie@peanutsstudio.test');
const patty = await login('patty@peanutsstudio.test');

// Charlie's own document, and a shared one.
const personal = await rest(charlie, 'documents', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: ORG, owner_id: charlie.id, uploaded_by: charlie.id,
    name: 'Access check contract', category: 'HR Documents',
    storage_path: `${ORG}/${charlie.id}/access-check.pdf`,
  }),
}).then((r) => r.json()).then((rows) => rows?.[0]);
check(Boolean(personal?.id), 'a personal document exists', JSON.stringify(personal).slice(0, 120));

const shared = await rest(lucy, 'documents', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: ORG, owner_id: null, uploaded_by: lucy.id,
    name: 'Access check handbook', category: 'Policies',
    storage_path: `${ORG}/shared/access-check.pdf`,
  }),
}).then((r) => r.json()).then((rows) => rows?.[0]);

// ------------------------------------------------------------------ recording
await rpc(lucy, 'log_document_access', { document: personal.id });
const logged = await rest(charlie, `document_access_log?select=*&document_id=eq.${personal.id}`)
  .then((r) => r.json());
check(logged.length === 1, 'opening somebody else\'s document is recorded', `${logged.length} rows`);
check(logged[0]?.actor_id === lucy.id, 'the record names who opened it');
check(logged[0]?.subject_id === charlie.id, 'and whose document it was');
check(logged[0]?.document_name === 'Access check contract', 'and what was opened');

// Reading your own file is nobody else's business.
await rpc(charlie, 'log_document_access', { document: personal.id });
const afterSelf = await rest(charlie, `document_access_log?select=id&document_id=eq.${personal.id}`)
  .then((r) => r.json());
check(afterSelf.length === 1, 'reading your own file is not logged');

// A handbook published to everybody is not surveillance material.
await rpc(charlie, 'log_document_access', { document: shared.id });
const sharedLog = await rest(lucy, `document_access_log?select=id&document_id=eq.${shared.id}`)
  .then((r) => r.json());
check(sharedLog.length === 0, 'opening a shared document is not logged');

// ------------------------------------------------------------------ who sees it
const hrSees = await rest(lucy, `document_access_log?select=id&document_id=eq.${personal.id}`)
  .then((r) => r.json());
check(hrSees.length === 1, 'whoever can see the workspace can see the log');

const colleagueSees = await rest(patty, `document_access_log?select=id&document_id=eq.${personal.id}`)
  .then((r) => r.json());
check(colleagueSees.length === 0, 'a colleague cannot read somebody else\'s access log');

// ------------------------------------------------------------------ tamper-proof
const forged = await rest(lucy, 'document_access_log', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: ORG, document_id: personal.id,
    subject_id: charlie.id, actor_id: charlie.id, document_name: 'Faked',
  }),
});
check(forged.status >= 400, 'nobody can write a log entry by hand', String(forged.status));

const erased = await rest(lucy, `document_access_log?id=eq.${logged[0].id}`, { method: 'DELETE' });
const stillThere = await rest(charlie, `document_access_log?select=id&id=eq.${logged[0].id}`)
  .then((r) => r.json());
check(stillThere.length === 1, 'nobody can erase one', `delete returned ${erased.status}`);

const rewritten = await rest(lucy, `document_access_log?id=eq.${logged[0].id}`, {
  method: 'PATCH', body: JSON.stringify({ actor_id: charlie.id }),
});
const unchanged = await rest(charlie, `document_access_log?select=actor_id&id=eq.${logged[0].id}`)
  .then((r) => r.json());
check(
  unchanged[0]?.actor_id === lucy.id,
  'nobody can rewrite who opened it',
  `patch returned ${rewritten.status}`,
);

// ------------------------------------------------------------------ tidy up
// The log hangs off the document, so deleting it takes the entries with it.
await rest(charlie, `documents?id=eq.${personal.id}`, { method: 'DELETE' });
await rest(lucy, `documents?id=eq.${shared.id}`, { method: 'DELETE' });
const left = await rest(lucy, `document_access_log?select=id&document_id=eq.${personal.id}`)
  .then((r) => r.json());
check(left.length === 0, 'fixtures restored', JSON.stringify(left).slice(0, 80));

console.log(bad === 0 ? '\nAll document access log checks passed.' : `\n${bad} failed.`);
process.exit(bad === 0 ? 0 : 1);
