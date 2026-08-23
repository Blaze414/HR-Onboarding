// Named filters. The value is entirely in who can see whose, so that is what
// this checks: a view is a bookmark, and a bookmark must never become a way to
// read rows or plant entries in somebody else's menu.
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
  return {
    token: s.access_token, id: s.user.id,
    cookie: `sb-127-auth-token=base64-${Buffer.from(JSON.stringify(s)).toString('base64')}`,
  };
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

const org = await rest(lucy, 'profiles?select=organisation_id&limit=1')
  .then((r) => r.json()).then((rows) => rows[0].organisation_id);

const created = [];
const save = async (who, body) => {
  const r = await rest(who, 'saved_views', { method: 'POST', body: JSON.stringify(body) });
  const rows = await r.json();
  if (Array.isArray(rows) && rows[0]?.id) created.push({ who, id: rows[0].id });
  return { status: r.status, rows };
};

// ---------------------------------------------------------------- saving
const mine = await save(lucy, {
  organisation_id: org, owner_id: lucy.id,
  name: 'Overdue only', path: '/reports', query: 'report=required&department=All',
});
check(mine.status === 201, 'a view can be saved', JSON.stringify(mine.rows).slice(0, 120));

const shared = await save(lucy, {
  organisation_id: org, owner_id: lucy.id,
  name: 'Everyone: expiring', path: '/reports', query: 'report=expiring', is_shared: true,
});
check(shared.status === 201, 'a view can be shared');

// ---------------------------------------------------------------- who sees what
const charlieSees = await rest(charlie, 'saved_views?select=name,is_shared').then((r) => r.json());
const names = (charlieSees ?? []).map((v) => v.name);
check(names.includes('Everyone: expiring'), 'a shared view reaches the workspace');
check(!names.includes('Overdue only'), 'a private view stays private', names.join(', '));

// ---------------------------------------------------------------- planting
const planted = await save(charlie, {
  organisation_id: org, owner_id: lucy.id,
  name: 'Not mine', path: '/reports', query: 'report=required',
});
check(planted.status >= 400, 'nobody can save a view into somebody else\'s list', String(planted.status));

// A view is a path and a query, never a destination. An absolute URL here would
// turn a shared view into a link a colleague's browser follows off-site.
const offsite = await save(lucy, {
  organisation_id: org, owner_id: lucy.id,
  name: 'Elsewhere', path: 'https://example.test/reports', query: '',
});
check(offsite.status >= 400, 'a view cannot point off-site', String(offsite.status));

// ---------------------------------------------------------------- deleting
const stolen = await rest(charlie, `saved_views?id=eq.${created[0].id}`, { method: 'DELETE' });
const stillThere = await rest(lucy, `saved_views?select=id&id=eq.${created[0].id}`).then((r) => r.json());
check(stillThere.length === 1, 'nobody can delete somebody else\'s view', `delete returned ${stolen.status}`);

// ---------------------------------------------------------------- the page
const load = (path) => fetch(`http://localhost:3100${path}`, { headers: { cookie: lucy.cookie } })
  .then((r) => r.text());

const onSavedView = await load('/reports?report=expiring');
check(onSavedView.includes('Everyone: expiring'), 'saved views appear on the report they belong to');
// Already saved under a name — offering to save it again is how a menu fills up
// with the same view three times.
check(!onSavedView.includes('Save this view'), 'a view already saved is not offered again');

const unsaved = await load('/reports?report=courses');
check(unsaved.includes('Save this view'), 'a view nobody has named offers to be saved');

// Fixtures restored: the next check group must find the seed it expects.
for (const row of created) {
  await rest(row.who, `saved_views?id=eq.${row.id}`, { method: 'DELETE' });
}
const left = await rest(lucy, 'saved_views?select=id').then((r) => r.json());
check(left.length === 0, 'fixtures restored', `${left.length} left behind`);

console.log(bad === 0 ? '\nAll saved view checks passed.' : `\n${bad} failed.`);
process.exit(bad === 0 ? 0 : 1);
