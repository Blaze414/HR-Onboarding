import type { Db } from '../supabase';

/**
 * One person's record, in the order it happened.
 *
 * Everything here was already visible — spread across six tabs, each sorted by
 * its own idea of importance. That is fine for answering "what training does
 * she owe" and useless for the two questions people actually bring to a record:
 * "what happened with this person" and "who did that, and when".
 *
 * Read-only and derived. Nothing is stored, so a timeline cannot drift out of
 * step with the rows it describes, and cannot show anything the caller could
 * not already read: every query runs through their own session.
 */
export interface TimelineEntry {
  id: string;
  at: string;
  kind: 'credential' | 'document' | 'training' | 'onboarding' | 'acknowledgement' | 'activity';
  title: string;
  detail?: string;
  /** Who did it, when it was somebody other than the employee. */
  actor?: string | null;
  href?: string;
}

type Embedded = { name?: string; title?: string } | { name?: string; title?: string }[] | null;

/** PostgREST returns an embedded row as an object or a one-element array. */
const labelOf = (value: unknown): string | null => {
  const embedded = value as Embedded;
  const row = Array.isArray(embedded) ? embedded[0] : embedded;
  return row?.name ?? row?.title ?? null;
};

export async function loadTimeline(
  db: Db, employeeId: string, limit = 60,
): Promise<TimelineEntry[]> {
  const [credentials, requests, assignments, steps, acknowledgements, activity] = await Promise.all([
    db.from('employee_credentials')
      .select('id, title, status, created_at, verified_at, review_note, verifier:profiles!employee_credentials_verified_by_fkey(name)')
      .eq('employee_id', employeeId),
    db.from('document_requests')
      .select('id, title, status, created_at, submitted_at, reviewed_at, review_note, requester:profiles!document_requests_requested_by_fkey(name), reviewer:profiles!document_requests_reviewed_by_fkey(name)')
      .eq('employee_id', employeeId),
    db.from('course_assignments')
      .select('id, assigned_at, completed_at, verified_at, is_required, due_date, course:courses(title), assigner:profiles!course_assignments_assigned_by_fkey(name), verifier:profiles!course_assignments_verified_by_fkey(name)')
      .eq('user_id', employeeId),
    db.from('onboarding_steps')
      .select('id, title, completed_at, onboarding:employee_onboarding!inner(employee_id, kind), completer:profiles!onboarding_steps_completed_by_fkey(name)')
      .eq('onboarding.employee_id', employeeId)
      .not('completed_at', 'is', null),
    db.from('document_acknowledgements')
      .select('document_id, acknowledged_at, document:documents(name)')
      .eq('user_id', employeeId),
    db.from('activity_log')
      .select('id, action, entity_type, metadata, created_at, actor:profiles!activity_log_actor_id_fkey(name)')
      .eq('actor_id', employeeId)
      .order('created_at', { ascending: false })
      .limit(limit),
  ]);

  const entries: TimelineEntry[] = [];
  const push = (entry: TimelineEntry | null) => { if (entry?.at) entries.push(entry); };

  for (const row of credentials.data ?? []) {
    push({
      id: `cred-add-${row.id}`, at: row.created_at, kind: 'credential',
      title: `Added ${row.title}`,
      detail: 'Waiting to be checked.',
      href: '/reports?report=checks',
    });
    if (row.verified_at) {
      push({
        id: `cred-check-${row.id}`, at: row.verified_at, kind: 'credential',
        title: `${row.title} ${row.status === 'Verified' ? 'accepted' : 'not accepted'}`,
        detail: row.review_note ?? undefined,
        actor: labelOf(row.verifier),
      });
    }
  }

  for (const row of requests.data ?? []) {
    push({
      id: `doc-ask-${row.id}`, at: row.created_at, kind: 'document',
      title: `Asked for ${row.title}`,
      actor: labelOf(row.requester),
    });
    if (row.submitted_at) {
      push({ id: `doc-back-${row.id}`, at: row.submitted_at, kind: 'document', title: `Returned ${row.title}` });
    }
    if (row.reviewed_at) {
      push({
        id: `doc-review-${row.id}`, at: row.reviewed_at, kind: 'document',
        title: `${row.title} ${row.status === 'Accepted' ? 'accepted' : 'sent back'}`,
        detail: row.review_note ?? undefined,
        actor: labelOf(row.reviewer),
      });
    }
  }

  for (const row of assignments.data ?? []) {
    const course = labelOf(row.course) ?? 'a course';
    push({
      id: `train-add-${row.id}`, at: row.assigned_at, kind: 'training',
      title: `Assigned ${course}`,
      detail: row.is_required ? `Required${row.due_date ? `, due ${row.due_date}` : ''}.` : undefined,
      actor: labelOf(row.assigner),
    });
    if (row.completed_at) {
      push({ id: `train-done-${row.id}`, at: row.completed_at, kind: 'training', title: `Marked ${course} complete` });
    }
    if (row.verified_at) {
      push({
        id: `train-ok-${row.id}`, at: row.verified_at, kind: 'training',
        title: `${course} confirmed`,
        actor: labelOf(row.verifier),
      });
    }
  }

  for (const row of steps.data ?? []) {
    const plan = (Array.isArray(row.onboarding) ? row.onboarding[0] : row.onboarding) as
      { kind?: string } | null;
    push({
      id: `step-${row.id}`, at: row.completed_at, kind: 'onboarding',
      title: `${plan?.kind === 'Offboarding' ? 'Leaving' : 'Joining'} step done — ${row.title}`,
      actor: labelOf(row.completer),
    });
  }

  for (const row of acknowledgements.data ?? []) {
    push({
      id: `ack-${row.document_id}`, at: row.acknowledged_at, kind: 'acknowledgement',
      title: `Confirmed reading ${labelOf(row.document) ?? 'a document'}`,
    });
  }

  for (const row of activity.data ?? []) {
    const subject = (row.metadata as Record<string, unknown> | null)?.title
      ?? (row.metadata as Record<string, unknown> | null)?.name;
    push({
      id: `act-${row.id}`, at: row.created_at, kind: 'activity',
      title: String(row.action).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
      detail: subject ? String(subject) : undefined,
    });
  }

  // Newest first: a record is read from the top, and the top is "what just
  // happened".
  entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return entries.slice(0, limit);
}
