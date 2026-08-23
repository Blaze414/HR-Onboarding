#!/usr/bin/env node
/**
 * End-to-end checks against a running stack.
 *
 *   npx supabase start && npm run db:reset
 *   npm run desktop        # in another terminal
 *   npm run check
 *
 * These exercise the real database and the real server-rendered pages: there is
 * no mocking anywhere, so a failure here is a failure a user would hit.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const checks = [
  ['Routes render for an admin', 'routes.mjs', [
    'lucy@peanutsstudio.test', 'dashboard', 'courses', 'tasks', 'events', 'documents',
    'onboarding', 'onboarding/templates', 'employees', 'departments', 'analytics',
    'reports', 'activity', 'worklist', 'profile', 'settings', 'settings/roles',
  ]],
  ['Role guards hold for an employee', 'role-guards.mjs', []],
  ['Admin tier separates by permission', 'role-separation.mjs', []],
  ['Create, edit and delete are separate', 'crud-permissions.mjs', []],
  ['CRUD holds at the database', 'crud-rls.mjs', []],
  ['Permissions are enforced, not decorative', 'permission-coverage.mjs', []],
  ['Notifications reach the right person', 'notifications.mjs', []],
  ['Required training is visible and ordered', 'required-training.mjs', []],
  ['Deadlines chase, records export', 'hr-workflow.mjs', []],
  ['Managers see teams, evidence is real', 'manager-and-evidence.mjs', []],
  ['Documents are requested and returned', 'document-requests.mjs', []],
  ['Credentials answer the rostering question', 'credentials.mjs', []],
  ['One queue shows what needs you', 'worklist.mjs', []],
  ['A record reads as one history', 'timeline.mjs', []],
  ['Saved views name a filter, not a grant', 'saved-views.mjs', []],
  ['Reminders leave the building', 'email-outbox.mjs', []],
  ['Reminders reach a shut phone', 'push-outbox.mjs', []],
  ['Filters actually filter', 'filters.mjs', []],
  ['Every device can reach the backend', 'backend-url.mjs', []],
  ['Sign in fails loudly, never hangs', 'signin-timeout.mjs', []],
  ['A session survives on any host', 'lan-session.mjs', []],
  ['Each device reaches only its own app', 'device-routing.mjs', []],
  ['Tampered tokens reach nothing', 'token-integrity.mjs', []],
  ['Progress propagates to every level', 'progress.mjs', []],
  ['Calendar follows live events', 'calendar.mjs', []],
];

// The checks complete real courses, tasks and onboarding steps, so start from
// the seed every time. Without this a second run finds nothing left to complete.
console.log('── Resetting demo data ' + '─'.repeat(38));
const reset = spawnSync('npx', ['supabase', 'db', 'reset'], {
  stdio: ['ignore', 'ignore', 'inherit'],
  cwd: path.join(here, '../..'),
});
// The CLI exits non-zero when a container it does not need reports unhealthy,
// even though the migrations and seed applied, so the checks below are the real
// verdict: if the reset genuinely failed, every one of them fails loudly.
if (reset.status !== 0) {
  console.warn('supabase db reset reported a problem; continuing — the checks will show if data is missing.');
}

let failed = 0;
for (const [label, file, args] of checks) {
  console.log(`\n── ${label} ${'─'.repeat(Math.max(0, 56 - label.length))}`);
  // Type stripping lets a check import the shared TypeScript source directly;
  // it is inert for the checks that do not.
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--no-warnings', path.join(here, file), ...args],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) failed += 1;
}

console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check group(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
