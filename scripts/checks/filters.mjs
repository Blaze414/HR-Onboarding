// A filter that returns the same rows whatever you pick is worse than no filter:
// it answers a question it did not ask, and nobody notices until a decision is
// made on it. Each filter below is exercised against the running app and must
// visibly change what comes back.
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const BASE = process.env.DESKTOP_URL ?? 'http://localhost:3100';

let bad = 0;
const check = (ok, label, detail = '') => {
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
};

async function login(email) {
  const r = await fetch('http://127.0.0.1:54321/auth/v1/token?grant_type=password', {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'snoopy123' }),
  });
  const s = await r.json();
  if (!s.access_token) throw new Error(`login failed for ${email}`);
  return { token: s.access_token,
           cookie: `sb-127-auth-token=base64-${Buffer.from(JSON.stringify(s)).toString('base64')}` };
}

const lucy = await login('lucy@peanutsstudio.test');
const page = (path) => fetch(`${BASE}${path}`, { headers: { cookie: lucy.cookie } }).then((r) => r.text());

/** Rows in the first table on the page. */
const rowCount = (html) => (html.match(/<tr>/g) ?? []).length;

/**
 * A filter is live when narrowing it returns strictly fewer rows than the
 * unfiltered page. Equal counts mean the parameter was ignored.
 */
async function narrows(label, unfiltered, filtered) {
  const [all, some] = await Promise.all([page(unfiltered), page(filtered)]);
  const before = rowCount(all);
  const after = rowCount(some);
  check(after < before && after >= 0, label, `${before} rows → ${after} rows`);
}

const dept = await fetch('http://127.0.0.1:54321/rest/v1/departments?select=id,name&limit=5', {
  headers: { apikey: ANON, Authorization: `Bearer ${lucy.token}` },
}).then((r) => r.json());
const technology = dept.find((d) => d.name === 'Technology')?.id;
// Narrowing has to be shown with a department that holds *fewer* of the rows in
// question. Filtering to the department that happens to hold all of them proves
// nothing — the counts match whether the parameter works or not.
const people = dept.find((d) => d.name === 'People & Culture')?.id;

await narrows('courses: status filter narrows', '/courses', '/courses?status=Completed');
await narrows('tasks: status filter narrows', '/tasks', '/tasks?status=Completed');
await narrows('tasks: priority filter narrows', '/tasks', '/tasks?priority=High');
await narrows('employees: department filter narrows', '/employees', `/employees?department=${technology}`);
await narrows('employees: search narrows', '/employees', '/employees?q=charlie');
await narrows('documents: category filter narrows', '/documents', '/documents?category=Policies');
await narrows('courses: search narrows', '/courses', '/courses?q=javascript');
await narrows('reports: department filter narrows the required-training report',
  '/reports?report=required', `/reports?report=required&department=${people}`);

// A control that cannot be used should not be rendered.
const reports = await page('/reports?report=required');
check(!/readOnly|readonly/i.test(reports), 'no read-only filter controls are rendered');
check(
  !/aria-label="From date"|aria-label="To date"/.test(reports),
  'the dead date-range inputs are gone',
);

// The department filter is only offered where it is read.
const courseReport = await page('/reports?report=courses');
// The filter renders as a labelled select rather than a named input.
check(
  !courseReport.includes('aria-label="Department"'),
  'no department filter on a report that ignores it',
);
check(
  reports.includes('aria-label="Department"'),
  'the department filter is offered where it works',
);

process.exit(bad ? 1 : 0);
