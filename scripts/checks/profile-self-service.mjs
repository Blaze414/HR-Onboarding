// What a person may change about themselves, and what they may not.
//
// RLS is row-level, not column-level: `profile_update_self` says "your row" and
// nothing about which fields, so before the column guard a PATCH of
// {"role":"admin"} against your own id was accepted — and every capability
// check reads that column. These checks prove that hole is shut, that the
// fields a person *does* own still save, and that an emergency contact is
// visible to HR and to nobody else's colleagues.
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const API = 'http://127.0.0.1:54321';

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
const patty = await login('patty@peanutsstudio.test');

const before = await rest(charlie, `profiles?select=*&id=eq.${charlie.id}`).then((r) => r.json());
const original = before[0];

// ------------------------------------------------------- the escalation itself
const promote = await rest(charlie, `profiles?id=eq.${charlie.id}`, {
  method: 'PATCH', body: JSON.stringify({ role: 'admin' }),
});
const promoteBody = await promote.json();
check(promote.status >= 400, 'an employee cannot promote themselves', String(promote.status));
check(
  /access level/i.test(promoteBody?.message ?? ''),
  'the refusal says why, rather than returning no rows',
  JSON.stringify(promoteBody).slice(0, 120),
);

const stillEmployee = await rest(lucy, `profiles?select=role&id=eq.${charlie.id}`).then((r) => r.json());
check(stillEmployee[0]?.role === 'employee', 'the role is unchanged after the attempt');

// ------------------------------------------------------- the quieter escalation
// Reassigning your own department, manager or job title is not privilege
// escalation, but it is HR's record being rewritten by its subject.
const rewritten = await rest(charlie, `profiles?id=eq.${charlie.id}`, {
  method: 'PATCH',
  body: JSON.stringify({
    job_title: 'Chief Executive',
    department_id: null,
    manager_id: null,
    is_active: false,
    email: 'somewhere@else.test',
    phone: '0400 999 000',
  }),
}).then((r) => r.json());

const after = rewritten[0];
check(after?.job_title === original.job_title, 'a job title is HR\'s to set, not yours');
check(after?.department_id === original.department_id, 'you cannot move your own department');
check(after?.manager_id === original.manager_id, 'you cannot change who you report to');
check(after?.is_active === true, 'you cannot deactivate yourself');
check(after?.email === original.email, 'you cannot rewrite the address you signed in with');
check(after?.phone === '0400 999 000', 'but your own phone number does save');

// ------------------------------------------------------- the emergency contact
const saved = await rest(charlie, 'emergency_contacts', {
  method: 'POST',
  body: JSON.stringify({
    user_id: charlie.id, organisation_id: 'aaaaaaaa-0000-0000-0000-000000000001',
    name: 'Sally Brown', relationship: 'Sister', phone: '0400 111 222',
  }),
}).then((r) => r.json());
check(saved?.[0]?.name === 'Sally Brown', 'an emergency contact saves', JSON.stringify(saved).slice(0, 120));

const hrSees = await rest(lucy, `emergency_contacts?select=phone&user_id=eq.${charlie.id}`)
  .then((r) => r.json());
check(hrSees?.[0]?.phone === '0400 111 222', 'HR can read it when it is needed');

/*
 * The reason this is a table rather than three more columns on `profiles`: the
 * directory is workspace-readable, so a column there is a column every
 * colleague can read. This is the assertion that caught it.
 */
const colleagueSees = await rest(patty, `emergency_contacts?select=phone&user_id=eq.${charlie.id}`)
  .then((r) => r.json());
check(
  Array.isArray(colleagueSees) && colleagueSees.length === 0,
  'a colleague cannot read somebody else\'s emergency contact',
  JSON.stringify(colleagueSees).slice(0, 120),
);

const forged = await rest(patty, 'emergency_contacts', {
  method: 'POST',
  body: JSON.stringify({
    user_id: charlie.id, organisation_id: 'aaaaaaaa-0000-0000-0000-000000000001',
    name: 'Wrong person', phone: '0400 000 000',
  }),
});
check(forged.status >= 400, 'nobody can record a contact on somebody else\'s behalf', String(forged.status));

/*
 * ------------------------------------------------- administrators are not exempt
 *
 * Marcie is an administrator but not a Super Administrator, which is the case
 * that matters: the tier below the top must not be able to move itself. Lucy is
 * deliberately not used here — she *is* the Super Administrator, so the guard
 * lets her through by design, and demoting her mid-suite leaves every later
 * check running as somebody who cannot see the workspace.
 */
const marcie = await login('marcie@peanutsstudio.test');
const marcieBefore = await rest(marcie, `profiles?select=role&id=eq.${marcie.id}`).then((r) => r.json());
const selfDemote = await rest(marcie, `profiles?id=eq.${marcie.id}`, {
  method: 'PATCH', body: JSON.stringify({ role: 'employee' }),
});
check(selfDemote.status >= 400, 'an administrator cannot change their own access level', String(selfDemote.status));

const marcieAfter = await rest(lucy, `profiles?select=role&id=eq.${marcie.id}`).then((r) => r.json());
check(
  marcieAfter[0]?.role === marcieBefore[0]?.role,
  'their access level is unchanged after the attempt',
  `${marcieBefore[0]?.role} → ${marcieAfter[0]?.role}`,
);

// ------------------------------------------------------- tidy up
await rest(charlie, `profiles?id=eq.${charlie.id}`, {
  method: 'PATCH', body: JSON.stringify({ phone: original.phone }),
});
await rest(charlie, `emergency_contacts?user_id=eq.${charlie.id}`, { method: 'DELETE' });
const restored = await rest(charlie, `profiles?select=phone,role&id=eq.${charlie.id}`).then((r) => r.json());
const contactLeft = await rest(charlie, `emergency_contacts?select=user_id&user_id=eq.${charlie.id}`)
  .then((r) => r.json());
check(
  restored[0]?.phone === original.phone && restored[0]?.role === 'employee' && contactLeft.length === 0,
  'fixtures restored',
  JSON.stringify(restored),
);

console.log(bad === 0 ? '\nAll profile self-service checks passed.' : `\n${bad} failed.`);
process.exit(bad === 0 ? 0 : 1);
