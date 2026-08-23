#!/usr/bin/env node
/**
 * Drains the push queue.
 *
 * The database queues a message per registered device whenever it raises a
 * notification; this delivers what is queued and marks it done. Safe to run
 * twice — a sent row is never picked up again.
 *
 * Delivery goes through Expo's push service, which fronts APNs and FCM, so a
 * workspace needs no Apple or Google credentials of its own to send. Set
 * EXPO_ACCESS_TOKEN if the project has push security enabled. Unset
 * PUSH_ENABLED (or pass --dry-run) and it prints what it would have sent and
 * leaves the queue alone, so local development never needs push configured.
 *
 * Tokens die: an uninstalled app, a restored phone, a factory reset. Expo says
 * so with DeviceNotRegistered, and the only correct response is to forget the
 * device rather than retry it forever.
 *
 *   node scripts/send-push.mjs [--dry-run] [--limit=200]
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
for (const file of [`${root}.env.local`, `${root}apps/desktop/.env.local`]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const URL_BASE = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENDPOINT = process.env.EXPO_PUSH_URL ?? 'https://exp.host/--/api/v2/push/send';
const ACCESS_TOKEN = process.env.EXPO_ACCESS_TOKEN;
const ENABLED = process.env.PUSH_ENABLED === 'true';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || !ENABLED;
const limit = Number(args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? 200);

if (!URL_BASE || !KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or run from a workspace with apps/desktop/.env.local).');
  process.exit(1);
}

const rest = (path, init = {}) =>
  fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

const pending = await rest(
  `push_outbox?select=id,token,title,body,href,attempts&sent_at=is.null&order=created_at.asc&limit=${limit}`,
).then((r) => r.json());

if (!Array.isArray(pending)) {
  console.error('Could not read the queue:', pending);
  process.exit(1);
}
if (pending.length === 0) {
  console.log('Nothing queued.');
  process.exit(0);
}

/*
 * One notification per device, in the order the reminders were raised.
 *
 * Deliberately not grouped the way mail is: a push has no body to list things
 * in, and a phone that buzzes once saying "4 things need you" is a phone that
 * tells you nothing you can act on. The badge count does that job instead.
 */
const messages = pending.map((row) => ({
  to: row.token,
  title: row.title,
  body: row.body ?? undefined,
  data: row.href ? { href: row.href } : undefined,
  sound: 'default',
}));

if (dryRun) {
  for (const message of messages) {
    console.log(`\n--- to ${message.to} ---\n${message.title}${message.body ? `\n${message.body}` : ''}`);
  }
  console.log(`\n${pending.length} queued for ${new Set(pending.map((r) => r.token)).size} device(s). Nothing sent — set PUSH_ENABLED=true to send.`);
  process.exit(0);
}

const stamp = () => new Date().toISOString();
let sent = 0;
let failed = 0;
let forgotten = 0;

// Expo takes a hundred messages a call. Chunking keeps one bad batch from
// taking the whole run with it.
for (let start = 0; start < messages.length; start += 100) {
  const batch = messages.slice(start, start + 100);
  const rows = pending.slice(start, start + 100);

  let tickets;
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(ACCESS_TOKEN ? { Authorization: `Bearer ${ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(batch),
    });
    if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
    tickets = (await response.json()).data ?? [];
  } catch (error) {
    failed += rows.length;
    // Left queued deliberately: a transient outage is worth retrying, and
    // `attempts` is what makes a persistent one visible.
    await Promise.all(rows.map((r) => rest(`push_outbox?id=eq.${r.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        attempts: (r.attempts ?? 0) + 1,
        last_error: String(error.message ?? error).slice(0, 500),
      }),
    })));
    console.error(`Batch failed: ${error.message ?? error}`);
    continue;
  }

  const delivered = [];
  const dead = [];

  for (const [index, ticket] of tickets.entries()) {
    const row = rows[index];
    if (!row) continue;
    if (ticket?.status === 'ok') { delivered.push(row.id); continue; }

    const reason = ticket?.details?.error ?? ticket?.message ?? 'unknown error';
    if (reason === 'DeviceNotRegistered') dead.push(row.token);
    failed++;
    await rest(`push_outbox?id=eq.${row.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        attempts: (row.attempts ?? 0) + 1,
        last_error: String(reason).slice(0, 500),
        // A dead device is not a retry. Marking it sent stops the queue
        // chasing a phone that no longer exists.
        ...(reason === 'DeviceNotRegistered' ? { sent_at: stamp() } : {}),
      }),
    });
  }

  if (delivered.length) {
    await rest(`push_outbox?id=in.(${delivered.join(',')})`, {
      method: 'PATCH', body: JSON.stringify({ sent_at: stamp() }),
    });
    sent += delivered.length;
  }

  for (const token of new Set(dead)) {
    await rest(`push_tokens?token=eq.${encodeURIComponent(token)}`, { method: 'DELETE' });
    forgotten++;
  }
}

console.log(`Sent ${sent}, failed ${failed}${forgotten ? `, forgot ${forgotten} dead device(s)` : ''}.`);
