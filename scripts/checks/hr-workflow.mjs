// The things an HR coordinator is actually held to: deadlines that chase people,
// a list of who has not done what, a record that can leave the screen, and work
// that does not vanish when someone leaves.
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

const lucy = await login('lucy@peanutsstudio.test');       // admin, and Charlie's manager
const charlie = await login('charlie@peanutsstudio.test'); // overdue on required training

const rpc = (who, fn) => fetch(`${API}/rest/v1/rpc/${fn}`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${who.token}`, 'Content-Type': 'application/json' },
  body: '{}',
}).then((r) => r.json());

const rest = (who, path) => fetch(`${API}/rest/v1/${path}`, {
  headers: { apikey: ANON, Authorization: `Bearer ${who.token}` },
}).then((r) => r.json());

// ---- deadlines chase people
const first = await rpc(charlie, 'notify_training_deadlines');
check(typeof first === 'number', 'the deadline sweep runs for a normal employee', JSON.stringify(first));

const second = await rpc(charlie, 'notify_training_deadlines');
check(second === 0, 'running it again raises nothing — no duplicate nagging', String(second));

const mine = await rest(charlie, 'notifications?select=kind,title&order=created_at.desc&limit=20');
check(mine.some((n) => n.kind === 'course_overdue'), 'the learner is told their training is overdue');
check(mine.some((n) => n.kind === 'course_due_soon'), 'the learner is warned before the deadline');

// The escalation is the part that actually moves mandatory training.
const managers = await rest(lucy, 'notifications?select=kind,title&kind=eq.report_overdue');
check(managers.length > 0, "the learner's manager is told they are overdue", JSON.stringify(managers).slice(0, 120));
check(
  managers.some((n) => n.title.includes('Charlie')),
  'the escalation names who is overdue',
  managers[0]?.title,
);

// ---- the list HR is asked for
const outstanding = await rest(lucy, 'outstanding_required_training?select=*');
check(Array.isArray(outstanding) && outstanding.length > 0, 'outstanding required training is listable');
check(
  outstanding.every((r) => r.employee_name && r.course_title && r.due_date),
  'every row names the person, the course and the deadline',
);
check(
  outstanding.some((r) => r.is_overdue && r.days_overdue > 0),
  'overdue rows carry how late they are',
);

// A leaver is not chased for work they cannot do.
const leaver = await rest(charlie, 'profiles?select=id&is_active=eq.false&limit=1');
check(
  outstanding.every((r) => !leaver.some?.((l) => l.id === r.employee_id)),
  'inactive people are excluded from the outstanding list',
);

// ---- the record can leave the screen
const csv = await fetch(`${BASE}/api/reports/outstanding-training`, { headers: { cookie: lucy.cookie } });
const body = await csv.text();
check(csv.status === 200, 'the export responds', String(csv.status));
check(csv.headers.get('content-type')?.includes('text/csv'), 'it is served as a spreadsheet file');
check(
  csv.headers.get('content-disposition')?.includes(new Date().toISOString().slice(0, 10)),
  'the filename carries the date it was run',
  csv.headers.get('content-disposition') ?? '',
);
check(body.split('\r\n')[0] === 'Employee,Email,Department,Manager,Course,Due,Days overdue,Progress %,Status',
  'the header names every column', body.split('\r\n')[0]);
check(body.split('\r\n').length - 1 === outstanding.length, 'every outstanding row is exported',
  `${body.split('\r\n').length - 1} rows vs ${outstanding.length}`);

// An employee must not be able to export the whole organisation.
const denied = await fetch(`${BASE}/api/reports/outstanding-training`, { headers: { cookie: charlie.cookie } });
const deniedBody = await denied.text();
check(
  denied.status !== 200 || deniedBody.includes('denied=1') || !deniedBody.includes('@peanutsstudio'),
  'an employee cannot export the organisation-wide list',
  String(denied.status),
);

process.exit(bad ? 1 : 0);
