// Reminders that reach a phone that is not open.
//
// The queue is the only part of push this product owns, so the checks are about
// the queue: that a registered device gets exactly one message per notification,
// that an unregistered person gets none, that nobody can register a device for
// somebody else or read anybody else's token, and that the sender empties it
// without sending anything twice.
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

const ORG = 'aaaaaaaa-0000-0000-0000-000000000001';
const DEVICE = 'ExponentPushToken[check-charlie-device]';

// ------------------------------------------------------------- registering
const registered = await rest(charlie, 'push_tokens', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: ORG, user_id: charlie.id, token: DEVICE, platform: 'ios',
  }),
});
check(registered.status < 300, 'a person can register their own device', String(registered.status));

const forSomebodyElse = await rest(charlie, 'push_tokens', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: ORG, user_id: lucy.id,
    token: 'ExponentPushToken[check-forged]', platform: 'ios',
  }),
});
check(forSomebodyElse.status >= 400, 'nobody can register a device for somebody else', String(forSomebodyElse.status));

// A token is an address you can send to, so it is not workspace-readable.
const lucySees = await rest(lucy, 'push_tokens?select=token').then((r) => r.json());
check(
  Array.isArray(lucySees) && !lucySees.some((row) => row.token === DEVICE),
  'an administrator cannot read somebody else\'s device token',
  JSON.stringify(lucySees).slice(0, 120),
);

// ------------------------------------------------------------- queueing
/*
 * Notifications are raised by what happens, never written by a client, so the
 * check does something real: an administrator assigns a task, which is the
 * shortest path from an action to a reminder.
 */
const task = await rest(lucy, 'tasks', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: ORG, title: 'Push queue check task',
    assigned_to: charlie.id, created_by: lucy.id, status: 'Pending', priority: 'Low',
  }),
}).then((r) => r.json());
const taskId = task?.[0]?.id;
check(Boolean(taskId), 'an action can be taken', JSON.stringify(task).slice(0, 160));

const raised = await rest(charlie, `notifications?select=id,href&entity_id=eq.${taskId}&order=created_at.desc`)
  .then((r) => r.json());
const raisedId = raised?.[0]?.id;
check(Boolean(raisedId), 'the action raises a notification', JSON.stringify(raised).slice(0, 160));

const queued = await rest(charlie, `push_outbox?select=id,token,title,href&notification_id=eq.${raisedId}`)
  .then((r) => r.json());
check(queued.length === 1, 'a registered device is queued exactly once', `${queued.length} rows`);
check(queued[0]?.token === DEVICE, 'the queued row carries the device token');
check(
  typeof queued[0]?.href === 'string' && queued[0].href.startsWith('/'),
  'the queued row carries where to open',
  String(queued[0]?.href),
);

// Somebody with no device registered queues nothing — the in-app list is still
// theirs, but there is nowhere to push to. Completing the task tells Lucy, who
// has registered no device.
await rest(charlie, `tasks?id=eq.${taskId}`, {
  method: 'PATCH', body: JSON.stringify({ status: 'Completed' }),
});
const lucyNote = await rest(lucy, `notifications?select=id&entity_id=eq.${taskId}&user_id=eq.${lucy.id}`)
  .then((r) => r.json());
const lucyQueued = lucyNote?.[0]?.id
  ? await rest(lucy, `push_outbox?select=id&notification_id=eq.${lucyNote[0].id}`).then((r) => r.json())
  : [];
check(lucyNote.length > 0, 'the assigner is told when it is done');
check(lucyQueued.length === 0, 'somebody with no registered device queues nothing');

// ------------------------------------------------------------- nobody writes
const forged = await rest(charlie, 'push_outbox', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: ORG, notification_id: raisedId, recipient_id: charlie.id,
    token: DEVICE, title: 'Hello',
  }),
});
check(forged.status >= 400, 'nobody can queue their own push', String(forged.status));

const rewritten = await rest(charlie, `push_outbox?id=eq.${queued[0]?.id}`, {
  method: 'PATCH', body: JSON.stringify({ token: 'ExponentPushToken[somewhere-else]' }),
});
const after = await rest(charlie, `push_outbox?select=token&id=eq.${queued[0]?.id}`).then((r) => r.json());
check(
  after[0]?.token === DEVICE,
  'nobody can redirect a queued push',
  `patch returned ${rewritten.status}`,
);

// ------------------------------------------------------------- the sender
const dry = spawnSync(process.execPath, ['scripts/send-push.mjs', '--limit=5'], { cwd: root, encoding: 'utf8' });
check(dry.status === 0, 'the sender runs', dry.stderr.slice(0, 200));
check(dry.stdout.includes('Nothing sent'), 'with push disabled it sends nothing');

const stillPending = await rest(charlie, `push_outbox?select=id&sent_at=is.null&notification_id=eq.${raisedId}`)
  .then((r) => r.json());
check(stillPending.length === 1, 'a dry run leaves the queue alone');

// ------------------------------------------------------------- tidy up
await rest(charlie, `push_tokens?token=eq.${encodeURIComponent(DEVICE)}`, { method: 'DELETE' });
// The queue rows hang off the notifications, so those go first — `entity_id`
// is a plain column, not a foreign key, so deleting the task would leave them.
await rest(charlie, `notifications?id=eq.${raisedId}`, { method: 'DELETE' });
if (lucyNote?.[0]?.id) await rest(lucy, `notifications?id=eq.${lucyNote[0].id}`, { method: 'DELETE' });
await rest(lucy, `tasks?id=eq.${taskId}`, { method: 'DELETE' });
const leftBehind = await rest(charlie, `push_outbox?select=id&notification_id=eq.${raisedId}`)
  .then((r) => r.json());
const deviceLeft = await rest(charlie, `push_tokens?select=id&token=eq.${encodeURIComponent(DEVICE)}`)
  .then((r) => r.json());
check(
  leftBehind.length === 0 && deviceLeft.length === 0,
  'fixtures restored',
  `${leftBehind.length} queued rows, ${deviceLeft.length} devices left`,
);

console.log(bad === 0 ? '\nAll push queue checks passed.' : `\n${bad} failed.`);
process.exit(bad === 0 ? 0 : 1);
