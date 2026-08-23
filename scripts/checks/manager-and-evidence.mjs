// Five capabilities an HR system is judged on. Each is checked at the database,
// through PostgREST as a real user, because the interface is not the boundary.
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

const rest = (who) => async (path, init = {}) => {
  const res = await fetch(`${API}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: ANON, Authorization: `Bearer ${who.token}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

const schroeder = await login('schroeder@peanutsstudio.test'); // employee, manages Patty
const patty = await login('patty@peanutsstudio.test');         // reports to Schroeder
const charlie = await login('charlie@peanutsstudio.test');     // unrelated employee
const lucy = await login('lucy@peanutsstudio.test');           // admin

const asSchroeder = rest(schroeder);
const asCharlie = rest(charlie);
const asPatty = rest(patty);
const asLucy = rest(lucy);

// ---------------------------------------------------------------- 1. managers
const seen = await asSchroeder('course_assignments?select=user_id');
const people = new Set((seen.body ?? []).map((r) => r.user_id));
check(people.has(patty.id), 'a manager sees their report\'s training');
check(people.has(schroeder.id), 'a manager still sees their own');
check(!people.has(charlie.id), 'a manager sees nobody else', `${people.size} people visible`);

const tasksSeen = await asSchroeder('tasks?select=assigned_to');
const taskPeople = new Set((tasksSeen.body ?? []).map((r) => r.assigned_to));
check(!taskPeople.has(charlie.id), 'team task visibility is scoped the same way');

// Visibility is not authority: a manager may look, not rewrite.
const meddling = await asSchroeder(`course_assignments?user_id=eq.${patty.id}`, {
  method: 'PATCH', body: JSON.stringify({ progress: 100 }),
});
check(
  !Array.isArray(meddling.body) || meddling.body.length === 0,
  'a manager cannot edit their report\'s progress',
);

// ---------------------------------------------------------------- 2. receipts
const doc = await asLucy('documents', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: ORG, name: `Policy probe ${Date.now()}`, category: 'Policies',
    storage_path: `probe/${Date.now()}.pdf`, uploaded_by: lucy.id, owner_id: null,
    requires_acknowledgement: true,
  }),
});
const docId = doc.body?.[0]?.id;
check(Boolean(docId), 'an admin can publish a document needing acknowledgement', JSON.stringify(doc.body).slice(0, 120));

const owed = await asLucy(`outstanding_acknowledgements?select=employee_name&document_id=eq.${docId}`);
check((owed.body ?? []).length > 0, 'everybody starts out owing an acknowledgement', `${(owed.body ?? []).length} people`);

const mine = await asCharlie('document_acknowledgements', {
  method: 'POST',
  body: JSON.stringify({ document_id: docId, user_id: charlie.id, organisation_id: ORG }),
});
check((mine.body ?? []).length === 1, 'a person can record their own acknowledgement');

const forged = await asCharlie('document_acknowledgements', {
  method: 'POST',
  body: JSON.stringify({ document_id: docId, user_id: patty.id, organisation_id: ORG }),
});
check(forged.status >= 400, 'nobody can acknowledge on somebody else\'s behalf', `status ${forged.status}`);

const after = await asLucy(`outstanding_acknowledgements?select=employee_id&document_id=eq.${docId}`);
check(
  !(after.body ?? []).some((r) => r.employee_id === charlie.id),
  'once acknowledged, a person drops off the outstanding list',
);

// An acknowledgement is a fact, not a setting: it cannot be taken back.
const retract = await asCharlie(`document_acknowledgements?document_id=eq.${docId}&user_id=eq.${charlie.id}`, {
  method: 'DELETE',
});
check(
  !Array.isArray(retract.body) || retract.body.length === 0,
  'an acknowledgement cannot be withdrawn',
);

// ---------------------------------------------------------------- 3. verification
// A course of this check's own, rather than one from the seed: marking a seeded
// assignment complete silently removes the overdue case other checks rely on.
// A check that quietly rewrites shared fixtures makes every later failure a lie.
const probeCourse = await asLucy('courses', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: ORG, title: `Verification probe ${Date.now()}`,
    status: 'In Progress', created_by: lucy.id,
  }),
});
const probeCourseId = probeCourse.body?.[0]?.id;

const probeAssignment = await asLucy('course_assignments', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: ORG, course_id: probeCourseId, user_id: charlie.id, assigned_by: lucy.id,
    is_required: true, due_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    status: 'Completed', progress: 100,
  }),
});
const assignmentId = probeAssignment.body?.[0]?.id;
check(Boolean(assignmentId), 'a required assignment exists to test with', JSON.stringify(probeAssignment.body).slice(0, 120));
const queue = await asLucy(`awaiting_verification?select=assignment_id&assignment_id=eq.${assignmentId}`);
check((queue.body ?? []).length > 0, 'completed required training queues for verification');

const selfVerify = await asCharlie(`course_assignments?id=eq.${assignmentId}`, {
  method: 'PATCH', body: JSON.stringify({ verified_at: new Date().toISOString(), verified_by: charlie.id }),
});
const stillUnverified = await asLucy(`course_assignments?select=verified_at&id=eq.${assignmentId}`);
check(
  stillUnverified.body?.[0]?.verified_at === null,
  'a learner cannot verify their own training',
  JSON.stringify(selfVerify.body).slice(0, 80),
);

await asLucy(`course_assignments?id=eq.${assignmentId}`, {
  method: 'PATCH', body: JSON.stringify({ verified_at: new Date().toISOString(), verified_by: lucy.id }),
});
const verified = await asLucy(`awaiting_verification?select=assignment_id&assignment_id=eq.${assignmentId}`);
check((verified.body ?? []).length === 0, 'verified training leaves the queue');

// A learner may move their own progress and nothing else. Row-level security
// cannot express that, so these are the columns the column guard protects.
const before = await asCharlie(`course_assignments?select=is_required,due_date&id=eq.${assignmentId}`);
await asCharlie(`course_assignments?id=eq.${assignmentId}`, {
  method: 'PATCH',
  body: JSON.stringify({ is_required: false, due_date: '2030-01-01', progress: 55 }),
});
const afterEdit = await asCharlie(`course_assignments?select=is_required,due_date,progress&id=eq.${assignmentId}`);
check(afterEdit.body?.[0]?.is_required === before.body?.[0]?.is_required,
  'a learner cannot clear their own requirement');
check(afterEdit.body?.[0]?.due_date === before.body?.[0]?.due_date,
  'a learner cannot move their own deadline', String(afterEdit.body?.[0]?.due_date));
check(afterEdit.body?.[0]?.progress === 55, 'a learner can still record their own progress');

// ---------------------------------------------------------------- 4. offboarding
const exitTemplates = await asLucy('onboarding_templates?select=id,name,kind&kind=eq.Offboarding');
check((exitTemplates.body ?? []).length > 0, 'an exit plan template exists');
check(
  (exitTemplates.body ?? []).every((t) => t.kind === 'Offboarding'),
  'exit templates are distinguishable from joining templates',
);

const joinTemplates = await asLucy('onboarding_templates?select=id&kind=eq.Onboarding');
check((joinTemplates.body ?? []).length > 0, 'joining templates are unaffected');

// ---------------------------------------------------------------- 5. cleanup
// Everything this check created is removed, so the fixtures other checks read
// are exactly as the seed left them.
await asLucy(`documents?id=eq.${docId}`, { method: 'DELETE' });
await asLucy(`courses?id=eq.${probeCourseId}`, { method: 'DELETE' });

process.exit(bad ? 1 : 0);
