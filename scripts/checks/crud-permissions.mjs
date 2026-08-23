// Create, edit and delete are separate grants. A role allowed to add a task must
// not be able to delete one — that was previously the same permission.
import { capabilityMatrix, crudColumn, CRUD_COLUMNS } from '../../packages/shared/src/capabilities.ts';

const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const BASE = process.env.DESKTOP_URL ?? 'http://localhost:3100';

let bad = 0;
const check = (ok, label, detail = '') => {
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
};

// ---- the vocabulary itself
for (const [capability, expected] of [
  ['task.create', 'create'], ['task.edit', 'update'], ['task.delete', 'delete'],
  ['course.view', 'read'], ['course.delete', 'delete'],
  ['employee.deactivate', 'delete'], ['department.manage', 'update'],
  ['task.complete', null], ['course.assign', null], ['event.rsvp', null],
]) {
  check(crudColumn(capability) === expected, `${capability} is ${expected ?? 'not a CRUD operation'}`, String(crudColumn(capability)));
}

const matrix = capabilityMatrix('admin');
const tasks = matrix.find((row) => row.group === 'Tasks');
check(Boolean(tasks), 'the matrix has a Tasks row');
check(
  CRUD_COLUMNS.every((column) => tasks?.cells[column]),
  'Tasks offers every CRUD operation',
  JSON.stringify(tasks?.cells),
);
check(
  (tasks?.extras ?? []).length > 0,
  'actions CRUD cannot describe are kept beside the grid, not dropped',
  JSON.stringify(tasks?.extras),
);

// Nothing may be lost: every admin capability appears somewhere in the matrix.
const placed = new Set(matrix.flatMap((row) => [...Object.values(row.cells).filter(Boolean), ...row.extras]));
const { capabilitiesForTier } = await import('../../packages/shared/src/capabilities.ts');
const missing = capabilitiesForTier('admin').filter((c) => !placed.has(c));
check(missing.length === 0, 'every admin capability is reachable in the editor', missing.join(', '));

// ---- the split is enforced, not merely expressed
const login = async (email) => {
  const r = await fetch('http://127.0.0.1:54321/auth/v1/token?grant_type=password', {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'snoopy123' }),
  });
  const s = await r.json();
  if (!s.access_token) throw new Error(`login failed for ${email}`);
  return `sb-127-auth-token=base64-${Buffer.from(JSON.stringify(s)).toString('base64')}`;
};

const rest = async (token, path, init = {}) => {
  const r = await fetch(`http://127.0.0.1:54321/rest/v1/${path}`, {
    ...init,
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  return r;
};

// Marcie is the Learning Coordinator: she creates and edits, and deletes nothing.
const marcieRaw = await fetch('http://127.0.0.1:54321/auth/v1/token?grant_type=password', {
  method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'marcie@peanutsstudio.test', password: 'snoopy123' }),
}).then((r) => r.json());

const perms = await rest(marcieRaw.access_token, 'roles?select=name,permissions&name=eq.Learning%20Coordinator')
  .then((r) => r.json());
const coordinator = perms?.[0]?.permissions ?? [];
check(coordinator.includes('task.create'), 'the coordinator can create tasks');
check(coordinator.includes('task.edit'), 'the coordinator can edit tasks');
check(!coordinator.includes('task.delete'), 'the coordinator cannot delete tasks');
check(!coordinator.some((p) => p.endsWith('.delete')), 'the coordinator holds no delete permission at all',
  coordinator.filter((p) => p.endsWith('.delete')).join(', '));

const admin = await rest(marcieRaw.access_token, 'roles?select=permissions&name=eq.Administrator').then((r) => r.json());
const adminPerms = admin?.[0]?.permissions ?? [];
for (const key of ['task.delete', 'course.delete', 'event.delete', 'department.delete']) {
  check(adminPerms.includes(key), `the administrator keeps ${key} after the migration`);
}

// ---- stored permissions and code must agree in both directions
const allRoles = await rest(marcieRaw.access_token, 'roles?select=name,permissions').then((r) => r.json());
const { ALL_CAPABILITIES } = await import('../../packages/shared/src/capabilities.ts');
const known = new Set(ALL_CAPABILITIES);
const stored = new Set((allRoles ?? []).flatMap((r) => r.permissions ?? []));

const orphaned = [...stored].filter((key) => !known.has(key));
check(orphaned.length === 0, 'no role stores a permission the code cannot check', orphaned.join(', '));

// The reverse — a capability the code knows but no role grants — is not an
// error on its own, but a system role granting nothing would be.
const systemGrants = (allRoles ?? []).filter((r) => ['Administrator', 'Super Administrator'].includes(r.name));
check(
  systemGrants.every((r) => (r.permissions ?? []).length > 30),
  'the system admin roles still grant a full set',
  systemGrants.map((r) => `${r.name}:${r.permissions?.length}`).join(' '),
);

process.exit(bad ? 1 : 0);
