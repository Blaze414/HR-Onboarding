#!/usr/bin/env node
/**
 * Drains the email queue.
 *
 * The database queues a message whenever it raises a notification; this sends
 * what is queued and marks it done. Run it from cron, or by hand — it is safe
 * to run twice, because a sent row is never picked up again.
 *
 * Messages are grouped into one email per person rather than sent one by one.
 * Four separate "your certificate expires" emails in a minute is how a person
 * learns to filter this sender into a folder they never open.
 *
 * Provider-agnostic: it POSTs {to, subject, text} to EMAIL_WEBHOOK_URL, which
 * can be a provider's own endpoint or three lines of glue in front of one.
 * Unset, it prints what it would have sent and leaves the queue alone, so a
 * local workspace never needs mail configured to be developed against.
 *
 *   node scripts/send-email.mjs [--dry-run] [--limit=200]
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
for (const file of [`${root}.env.local`, `${root}apps/desktop/.env.local`]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const URL_BASE = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WEBHOOK = process.env.EMAIL_WEBHOOK_URL;
const FROM = process.env.EMAIL_FROM ?? 'no-reply@example.test';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? '';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || !WEBHOOK;
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
  `email_outbox?select=id,recipient_email,subject,body,href,attempts&sent_at=is.null&order=created_at.asc&limit=${limit}`,
).then((r) => r.json());

if (!Array.isArray(pending)) {
  console.error('Could not read the queue:', pending);
  process.exit(1);
}
if (pending.length === 0) {
  console.log('Nothing queued.');
  process.exit(0);
}

// One email per person, in the order the reminders were raised.
const byRecipient = new Map();
for (const row of pending) {
  if (!byRecipient.has(row.recipient_email)) byRecipient.set(row.recipient_email, []);
  byRecipient.get(row.recipient_email).push(row);
}

const stamp = () => new Date().toISOString();
let sent = 0;
let failed = 0;

for (const [to, rows] of byRecipient) {
  const subject = rows.length === 1
    ? rows[0].subject
    : `${rows.length} things need you at work`;

  const line = (r, bullet) => {
    const link = r.href ? `\n${bullet ? '  ' : ''}${APP_URL}${r.href}` : '';
    return `${bullet ? '• ' : ''}${bullet ? r.subject : ''}${r.body ? `${bullet ? '\n  ' : ''}${r.body}` : ''}${link}`;
  };

  // A single reminder reads as a sentence; several read as a list. Bulleting
  // one item under a heading that repeats it is how a useful mail starts
  // looking automated.
  const text = rows.length === 1
    ? line(rows[0], false)
    : ['A few things are waiting on you:\n', ...rows.map((r) => line(r, true))].join('\n');

  if (dryRun) {
    console.log(`\n--- to ${to} ---\n${subject}\n\n${text}`);
    continue;
  }

  try {
    const response = await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to, subject, text }),
    });
    if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);

    await rest(`email_outbox?id=in.(${rows.map((r) => r.id).join(',')})`, {
      method: 'PATCH',
      body: JSON.stringify({ sent_at: stamp() }),
    });
    sent += rows.length;
  } catch (error) {
    failed += rows.length;
    /*
     * Left queued deliberately. A message that failed to send is worth
     * retrying, and `attempts` is what turns a transient outage into something
     * visible rather than an inbox that silently stays empty.
     */
    await Promise.all(rows.map((r) => rest(`email_outbox?id=eq.${r.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ attempts: (r.attempts ?? 0) + 1, last_error: String(error.message ?? error).slice(0, 500) }),
    })));
    console.error(`Could not send to ${to}: ${error.message ?? error}`);
  }
}

if (dryRun) {
  console.log(`\n${pending.length} queued for ${byRecipient.size} ${byRecipient.size === 1 ? 'person' : 'people'}. Nothing sent — set EMAIL_WEBHOOK_URL to send.`);
} else {
  console.log(`Sent ${sent}, failed ${failed}.`);
}
