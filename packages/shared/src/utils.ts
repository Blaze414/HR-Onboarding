import type { StepStatus, TaskStatus } from './types';

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function firstName(name: string): string {
  return name.split(' ')[0] ?? name;
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
}

export function formatRelativeDay(value: string | null | undefined): string {
  if (!value) return 'No due date';
  const due = new Date(value);
  const today = new Date();
  const days = Math.round(
    (Date.UTC(due.getFullYear(), due.getMonth(), due.getDate()) -
      Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86_400_000,
  );
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days === -1) return '1 day overdue';
  if (days < 0) return `${Math.abs(days)} days overdue`;
  return `Due in ${days} days`;
}

export function isOverdue(dueDate: string | null, status: TaskStatus | StepStatus): boolean {
  if (!dueDate || status === 'Completed') return false;
  return new Date(dueDate) < new Date(new Date().toDateString());
}

export function percent(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${Math.round(value)}%`;
}

/** Storage path layout: {organisation_id}/{owner_id | 'shared'}/{timestamp}-{filename} */
export function documentStoragePath(
  organisationId: string,
  ownerId: string | null,
  fileName: string,
): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '-');
  return `${organisationId}/${ownerId ?? 'shared'}/${Date.now()}-${safe}`;
}

/** Turns a Supabase/network failure into something a person can read. */
export function friendlyError(error: unknown): string {
  const raw = (error as { message?: string })?.message ?? '';
  if (!raw) return 'Something went wrong. Please try again.';
  if (/invalid login credentials/i.test(raw)) return 'That email and password combination does not match an account.';
  if (/row-level security/i.test(raw)) return 'You do not have permission to do that.';
  if (/duplicate key/i.test(raw)) return 'That record already exists.';
  // An aborted request means the deadline passed with no reply at all, which is
  // what an unreachable host looks like from a phone: not a refusal, just silence.
  if (/aborted|timeout|timed out|signal/i.test(raw)) {
    return 'The server did not answer in time. This device may be on a different network to the workspace backend.';
  }
  // "Load failed" is Safari's wording for a fetch that never reached the server.
  if (/failed to fetch|fetch failed|load failed|network request failed|network/i.test(raw)) {
    return 'Cannot reach the server. Check that the workspace backend is running and reachable from this device.';
  }
  if (/jwt|session/i.test(raw)) return 'Your session has expired. Please sign in again.';
  return raw;
}

/**
 * Points a configured backend URL at a host the *current device* can reach.
 *
 * A loopback address means "this machine". That is true for the machine running
 * the stack, and false for every other device: on a phone, or in a browser tab
 * served from a LAN address, `127.0.0.1` is the phone itself, so the request
 * fails before it leaves the device. The symptom is a connection error at sign
 * in, which reads like a dead backend even though the backend is fine.
 *
 * `deviceHost` is where the app itself was served from — the page host on web,
 * the packager host on a native build. When the configured URL is loopback and
 * the device is somewhere else, the host is swapped and the port kept, because
 * a dev stack that serves the app on a LAN address serves its backend there too.
 */
export function resolveBackendUrl(configured: string, deviceHost: string | null): string {
  if (!configured || !deviceHost) return configured;

  const LOOPBACK = ['127.0.0.1', 'localhost', '0.0.0.0', '[::1]', '::1'];
  try {
    const url = new URL(configured);
    if (!LOOPBACK.includes(url.hostname)) return configured;
    // Strip any port the caller passed along with the host.
    const host = deviceHost.replace(/:\d+$/, '');
    if (!host || LOOPBACK.includes(host)) return configured;
    url.hostname = host;
    return url.toString().replace(/\/$/, '');
  } catch {
    return configured;
  }
}

/**
 * Renders rows as CSV.
 *
 * HR work ends in a spreadsheet more often than anyone likes to admit: a list
 * that cannot leave the screen cannot be taken to a meeting, sent to a manager,
 * or kept as the record of what was outstanding on a given day.
 */
export function toCsv(rows: Record<string, unknown>[], columns: { key: string; label: string }[]): string {
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    // Quote anything that would otherwise break the row apart, and double any
    // quotes inside it — the standard escape, and the one spreadsheets expect.
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = columns.map((c) => escape(c.label)).join(',');
  const body = rows.map((row) => columns.map((c) => escape(row[c.key])).join(','));
  return [header, ...body].join('\r\n');
}

/**
 * "today", "yesterday", "3 days ago", then a date.
 *
 * Approvals are read in relation to now for the first week — whether something
 * was checked before or after an incident is the question — and by date after
 * that, when "47 days ago" stops meaning anything.
 */
export function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return '';
  const then = new Date(value);
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return `on ${then.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}
