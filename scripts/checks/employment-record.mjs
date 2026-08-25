// The employee record, and the statements that go with it.
//
// Three obligations are under test, and each one has a way of quietly not
// happening:
//
//   * Employment particulars (Fair Work Regulations 2009 reg 3.32) — held as
//     columns, contradiction refused, and not editable by the employee whose
//     record it is.
//   * Retention (reg 3.31) — a personal document becomes a record the employer
//     must keep for seven years, and deletion after the day it was filed is
//     refused rather than merely discouraged.
//   * Information statements (Fair Work Act s.125 and s.125B) — the falling-due
//     dates are computed from the record, not remembered; a casual accrues them
//     repeatedly and everybody else once; and what has been handed over cannot
//     be edited or withdrawn afterwards.
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const API = 'http://127.0.0.1:54321';
const ORG = 'aaaaaaaa-0000-0000-0000-000000000001';
const SCHROEDER = '11111111-1111-1111-1111-000000000003'; // casual
const CHARLIE = '11111111-1111-1111-1111-000000000002';   // ongoing full-time

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

const lucy = await login('lucy@peanutsstudio.test');
const charlie = await login('charlie@peanutsstudio.test');
const schroeder = await login('schroeder@peanutsstudio.test');

// ------------------------------------------------------- employment particulars
const seeded = await rest(lucy, `profiles?id=eq.${SCHROEDER}&select=employment_hours,employment_basis`)
  .then((r) => r.json()).then((rows) => rows?.[0]);
check(seeded?.employment_hours === 'Casual' && seeded?.employment_basis === 'Casual',
  'the record says what kind of employment it is', JSON.stringify(seeded));

const contradiction = await rest(lucy, `profiles?id=eq.${CHARLIE}`, {
  method: 'PATCH', body: JSON.stringify({ employment_hours: 'Casual', employment_basis: 'Ongoing' }),
});
check(contradiction.status >= 400, 'casual on one count and not the other is refused',
  `status ${contradiction.status}`);

const selfEdit = await rest(charlie, `profiles?id=eq.${charlie.id}`, {
  method: 'PATCH', body: JSON.stringify({ employment_basis: 'Ongoing', employment_hours: 'Full-time' }),
});
const charlieAfter = await rest(lucy, `profiles?id=eq.${CHARLIE}&select=employment_basis`)
  .then((r) => r.json()).then((rows) => rows?.[0]);
check(charlieAfter?.employment_basis === 'Ongoing',
  'an employee cannot rewrite their own employment basis', `self edit status ${selfEdit.status}`);

// ------------------------------------------------------------------- retention
const fresh = await rest(lucy, 'documents', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: ORG, owner_id: CHARLIE, uploaded_by: lucy.id,
    name: 'Retention check contract', category: 'HR Documents',
    storage_path: `${ORG}/${CHARLIE}/retention-check.pdf`,
  }),
}).then((r) => r.json()).then((rows) => rows?.[0]);

check(Boolean(fresh?.retain_until), 'a personal document is stamped with how long it must be kept',
  JSON.stringify(fresh?.retain_until));
const years = fresh?.retain_until
  ? new Date(fresh.retain_until).getFullYear() - new Date(fresh.created_at).getFullYear() : 0;
check(years === 7, 'kept for seven years', `${years}`);

// Filed today, so it is still correctable.
const sameDay = await rest(lucy, `documents?id=eq.${fresh.id}`, { method: 'DELETE' });
check(sameDay.status < 400, 'a document filed today can still be taken back off',
  `status ${sameDay.status}`);

// Backdate one to yesterday: now it is a record.
const older = await rest(lucy, 'documents', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: ORG, owner_id: CHARLIE, uploaded_by: lucy.id,
    name: 'Retention check older', category: 'HR Documents',
    storage_path: `${ORG}/${CHARLIE}/retention-older.pdf`,
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
  }),
}).then((r) => r.json()).then((rows) => rows?.[0]);

const blocked = await rest(lucy, `documents?id=eq.${older.id}`, { method: 'DELETE' });
const blockedBody = await blocked.text();
check(blocked.status >= 400, 'a record inside its retention period cannot be deleted',
  `status ${blocked.status}`);
check(/must be kept until/i.test(blockedBody), 'and it says until when', blockedBody.slice(0, 140));

// Shortening the period would defeat the guard above, so it is refused —
// silently, by keeping the later date, because the caller has no business
// setting it either way.
await rest(lucy, `documents?id=eq.${older.id}`, {
  method: 'PATCH', body: JSON.stringify({ retain_until: '2020-01-01' }),
});
const shortened = await rest(lucy, `documents?id=eq.${older.id}&select=retain_until`)
  .then((r) => r.json()).then((rows) => rows?.[0]);
check(shortened?.retain_until === older.retain_until, 'retention cannot be shortened',
  `${older.retain_until} -> ${shortened?.retain_until}`);
const stillBlocked = await rest(lucy, `documents?id=eq.${older.id}`, { method: 'DELETE' });
check(stillBlocked.status >= 400, 'so the record still cannot be deleted', `status ${stillBlocked.status}`);

// Holding it longer is allowed: a record kept for a dispute outlives the rule.
await rest(lucy, `documents?id=eq.${older.id}`, {
  method: 'PATCH', body: JSON.stringify({ retain_until: '2040-01-01' }),
});
const extended = await rest(lucy, `documents?id=eq.${older.id}&select=retain_until`)
  .then((r) => r.json()).then((rows) => rows?.[0]);
check(extended?.retain_until === '2040-01-01', 'but it can be held for longer',
  extended?.retain_until);

// A shared document is not anybody's record.
const shared = await rest(lucy, 'documents', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: ORG, owner_id: null, uploaded_by: lucy.id,
    name: 'Retention check handbook', category: 'Policies',
    storage_path: `${ORG}/shared/retention-check.pdf`,
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
  }),
}).then((r) => r.json()).then((rows) => rows?.[0]);
const sharedDelete = await rest(lucy, `documents?id=eq.${shared.id}`, { method: 'DELETE' });
check(sharedDelete.status < 400, 'a shared document is not an employment record',
  `status ${sharedDelete.status}`);

// ------------------------------------------------------------------ statements
const owed = await rest(lucy, 'statement_obligations?select=*').then((r) => r.json());
const fwis = owed.filter((r) => r.kind === 'Fair Work Information Statement');
const ceis = owed.filter((r) => r.kind === 'Casual Employment Information Statement');

check(fwis.some((r) => r.employee_id === CHARLIE),
  'everybody is owed the Fair Work Information Statement');
check(fwis.filter((r) => r.employee_id === CHARLIE).length === 1,
  'and only once', `${fwis.filter((r) => r.employee_id === CHARLIE).length}`);
check(!ceis.some((r) => r.employee_id === CHARLIE),
  'somebody who is not casual is not owed the casual statement');
check(ceis.filter((r) => r.employee_id === SCHROEDER).length > 1,
  'a casual is owed it again after the first time',
  `${ceis.filter((r) => r.employee_id === SCHROEDER).length}`);
check(ceis.some((r) => r.employee_id === SCHROEDER && r.status === 'Upcoming'),
  'including one that has not fallen due yet');

const due = ceis.find((r) => r.employee_id === SCHROEDER && r.status === 'Overdue');
const recorded = await rest(lucy, 'statement_issues', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: ORG, employee_id: SCHROEDER, kind: due.kind, due_on: due.due_on, issued_by: lucy.id,
  }),
});
check(recorded.status < 400, 'HR can record that a statement was handed over', `status ${recorded.status}`);

const after = await rest(lucy, 'statement_obligations?select=*').then((r) => r.json());
const settled = after.find((r) => r.employee_id === SCHROEDER && r.kind === due.kind && r.due_on === due.due_on);
check(settled?.status === 'Given', 'and the obligation reads as settled', settled?.status);

const selfIssue = await rest(schroeder, 'statement_issues', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: ORG, employee_id: SCHROEDER, kind: 'Fair Work Information Statement',
    due_on: '2025-09-01',
  }),
});
check(selfIssue.status >= 400, 'an employee cannot record that they were given one',
  `status ${selfIssue.status}`);

const rewrite = await rest(lucy, `statement_issues?employee_id=eq.${SCHROEDER}`, {
  method: 'PATCH', body: JSON.stringify({ due_on: '2030-01-01' }),
});
check(rewrite.status >= 400, 'and nobody can move the date afterwards', `status ${rewrite.status}`);

const erase = await rest(lucy, `statement_issues?employee_id=eq.${SCHROEDER}`, { method: 'DELETE' });
check(erase.status >= 400, 'or take the record of it away', `status ${erase.status}`);

// Schroeder sees his own; Charlie sees nothing of Schroeder's.
const mine = await rest(schroeder, 'statement_issues?select=employee_id').then((r) => r.json());
check(Array.isArray(mine) && mine.every((r) => r.employee_id === schroeder.id) && mine.length > 0,
  'an employee sees what they were given, and only that', JSON.stringify(mine).slice(0, 120));
const nosy = await rest(charlie, `statement_issues?select=employee_id&employee_id=eq.${SCHROEDER}`)
  .then((r) => r.json());
check(Array.isArray(nosy) && nosy.length === 0, 'and not what a colleague was given',
  JSON.stringify(nosy).slice(0, 120));

process.exit(bad === 0 ? 0 : 1);
