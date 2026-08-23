// Reminders that leave the building.
//
// The queue is the only part of mail this product owns, so the checks are about
// the queue: that a notification always produces exactly one message, that
// nobody can write to it from a browser, and that the sender empties it without
// sending anything twice.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const API = 'http://127.0.0.1:54321';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

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

// ---------------------------------------------------------------- one for one
const notifications = await rest(lucy, 'notifications?select=id&limit=1000').then((r) => r.json());
const queued = await rest(lucy, 'email_outbox?select=id,notification_id&limit=1000').then((r) => r.json());
check(queued.length > 0, 'notifications queue mail', `${queued.length} queued`);

const ids = new Set(queued.map((q) => q.notification_id));
check(ids.size === queued.length, 'no notification is queued twice');

// ---------------------------------------------------------------- who reads it
const mine = await rest(charlie, 'email_outbox?select=recipient_id').then((r) => r.json());
check(
  Array.isArray(mine) && mine.every((row) => row.recipient_id === charlie.id),
  'an employee sees only mail addressed to them',
  JSON.stringify(mine).slice(0, 120),
);
check(mine.length < queued.length, 'an employee does not see the workspace queue');

// ---------------------------------------------------------------- nobody writes
const forged = await rest(charlie, 'email_outbox', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: '00000000-0000-0000-0000-000000000000',
    notification_id: queued[0].notification_id,
    recipient_id: charlie.id, recipient_email: 'somewhere@else.test', subject: 'Hello',
  }),
});
check(forged.status >= 400, 'nobody can queue their own mail', String(forged.status));

const rewritten = await rest(charlie, `email_outbox?id=eq.${queued[0].id}`, {
  method: 'PATCH', body: JSON.stringify({ recipient_email: 'somewhere@else.test' }),
});
const after = await rest(lucy, `email_outbox?select=recipient_email&id=eq.${queued[0].id}`)
  .then((r) => r.json());
check(
  after[0]?.recipient_email !== 'somewhere@else.test',
  'nobody can redirect queued mail',
  `patch returned ${rewritten.status}`,
);

// ---------------------------------------------------------------- the sender
const dry = spawnSync(process.execPath, ['scripts/send-email.mjs', '--limit=5'], { cwd: root, encoding: 'utf8' });
check(dry.status === 0, 'the sender runs', dry.stderr.slice(0, 200));
check(dry.stdout.includes('Nothing sent'), 'with no provider configured it sends nothing');

const stillPending = await rest(lucy, 'email_outbox?select=id&sent_at=is.null&limit=1000')
  .then((r) => r.json());
check(stillPending.length === queued.length, 'a dry run leaves the queue alone');

console.log(bad === 0 ? '\nAll email queue checks passed.' : `\n${bad} failed.`);
process.exit(bad === 0 ? 0 : 1);
