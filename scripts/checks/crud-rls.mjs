// The CRUD split has to hold at the database, not only in the server actions.
// Everything here goes through PostgREST as a real user, which is the path an
// application bug — or a determined client — would take.
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

const coordinator = await login('marcie@peanutsstudio.test'); // create + edit, no delete
const superAdmin = await login('lucy@peanutsstudio.test');    // everything
const employee = await login('charlie@peanutsstudio.test');
const asCoordinator = rest(coordinator);
const asSuper = rest(superAdmin);
const asEmployee = rest(employee);

const rows = (r) => (Array.isArray(r.body) ? r.body.length : 0);
const stamp = Date.now();

// ---- create and edit are granted, delete is not
const made = await asCoordinator('tasks', {
  method: 'POST',
  body: JSON.stringify({ organisation_id: ORG, title: `rls probe ${stamp}`, created_by: coordinator.id }),
});
check(rows(made) === 1, 'a role with create may insert', JSON.stringify(made.body));
const taskId = made.body?.[0]?.id;

const edited = await asCoordinator(`tasks?id=eq.${taskId}`, {
  method: 'PATCH', body: JSON.stringify({ priority: 'High' }),
});
check(rows(edited) === 1, 'a role with edit may update');

const refused = await asCoordinator(`tasks?id=eq.${taskId}`, { method: 'DELETE' });
check(rows(refused) === 0, 'a role without delete cannot delete, even via the API');

// Still there — the refusal was real, not a silent success.
const stillThere = await asSuper(`tasks?select=id&id=eq.${taskId}`);
check(rows(stillThere) === 1, 'the refused row genuinely survived');

const removed = await asSuper(`tasks?id=eq.${taskId}`, { method: 'DELETE' });
check(rows(removed) === 1, 'a role with delete may delete');

// ---- documents: your own file is yours; someone else's needs the permission
const theirs = await asCoordinator(`documents?select=id&owner_id=neq.${coordinator.id}&limit=1`);
const foreignDoc = theirs.body?.[0]?.id;
if (foreignDoc) {
  const denied = await asCoordinator(`documents?id=eq.${foreignDoc}`, { method: 'DELETE' });
  check(rows(denied) === 0, "a role without document.delete cannot remove someone else's file");
} else {
  check(false, 'a document owned by someone else was available to test with');
}

// ---- the permissions employees depend on must survive the tightening
const ownTask = await asEmployee(`tasks?select=id&assigned_to=eq.${employee.id}&limit=1`);
const ownTaskId = ownTask.body?.[0]?.id;
const completed = await asEmployee(`tasks?id=eq.${ownTaskId}`, {
  method: 'PATCH', body: JSON.stringify({ status: 'In Progress' }),
});
check(rows(completed) === 1, 'an employee can still update their own task');

const ownAssignment = await asEmployee(`course_assignments?select=id&user_id=eq.${employee.id}&limit=1`);
const progressed = await asEmployee(`course_assignments?id=eq.${ownAssignment.body?.[0]?.id}`, {
  method: 'PATCH', body: JSON.stringify({ progress: 42 }),
});
check(rows(progressed) === 1, 'an employee can still record their own course progress');

const profile = await asEmployee(`profiles?id=eq.${employee.id}`, {
  method: 'PATCH', body: JSON.stringify({ phone: '0400 000 002' }),
});
check(rows(profile) === 1, 'an employee can still edit their own profile');

// ---- an employee cannot reach admin operations at all
const escalation = await asEmployee('tasks', {
  method: 'POST',
  body: JSON.stringify({ organisation_id: ORG, title: 'should not exist', created_by: employee.id }),
});
check(rows(escalation) === 0 || escalation.status >= 400, 'an employee still cannot create tasks for others');

process.exit(bad ? 1 : 0);
