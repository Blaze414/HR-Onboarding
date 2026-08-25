import type { Db } from '../supabase';
import type { SignInEvent } from './auth';

/**
 * What a Super Administrator needs when something has gone wrong.
 *
 * Under the Notifiable Data Breaches scheme an organisation that suspects an
 * eligible breach has to assess it and, if it is one, tell the OAIC and the
 * people affected. Those are questions about whose account, from where, when,
 * and what was touched — none of which can be answered from a log each person
 * reads one row of.
 *
 * Everything here is read through the caller's own session, so the policies
 * decide what comes back. There is no privileged client on this path: a Super
 * Administrator sees their own workspace because the policy says so, and an
 * ordinary admin asking the same question gets nothing.
 */

export interface AuditEntry {
  id: string;
  action: 'created' | 'updated' | 'deleted';
  entity: string;
  entity_id: string | null;
  changes: Record<string, { from: unknown; to: unknown }>;
  at: string;
  actor?: { id: string; name: string } | null;
  subject?: { id: string; name: string } | null;
}

export interface WorkspaceSignIn extends SignInEvent {
  user_id: string | null;
  person?: { id: string; name: string } | null;
}

/**
 * Record that somebody looked, and why.
 *
 * Called before the data is read, not after: a look that failed halfway
 * through is still a look. The reason is required by the database — an
 * investigation has one, and a breach report has to say what prompted it.
 */
export async function recordLogRead(db: Db, reason: string, subjectId?: string): Promise<void> {
  const { error } = await db.rpc('record_sign_in_log_read', {
    why: reason, subject: subjectId ?? null,
  });
  if (error) throw error;
}

export async function listWorkspaceSignIns(
  db: Db, opts: { personId?: string; limit?: number } = {},
): Promise<WorkspaceSignIn[]> {
  let query = db
    .from('sign_in_events')
    .select('id, user_id, succeeded, ip, user_agent, client, device, time_zone, at, person:profiles!sign_in_events_user_id_fkey(id,name)')
    .order('at', { ascending: false })
    .limit(opts.limit ?? 200);
  if (opts.personId) query = query.eq('user_id', opts.personId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as WorkspaceSignIn[];
}

export async function listAudit(
  db: Db, opts: { actorId?: string; subjectId?: string; limit?: number } = {},
): Promise<AuditEntry[]> {
  let query = db
    .from('audit_log')
    .select('id, action, entity, entity_id, changes, at, actor:profiles!audit_log_actor_id_fkey(id,name), subject:profiles!audit_log_subject_id_fkey(id,name)')
    .order('at', { ascending: false })
    .limit(opts.limit ?? 200);
  if (opts.actorId) query = query.eq('actor_id', opts.actorId);
  if (opts.subjectId) query = query.eq('subject_id', opts.subjectId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as AuditEntry[];
}

/** Who has looked at the history, and why. Visible to the same people. */
export interface LogRead {
  id: string;
  reason: string;
  at: string;
  reader?: { id: string; name: string } | null;
}

export async function listLogReads(db: Db, limit = 50): Promise<LogRead[]> {
  const { data, error } = await db
    .from('sign_in_log_reads')
    .select('id, reason, at, reader:profiles!sign_in_log_reads_reader_id_fkey(id,name)')
    .order('at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as LogRead[];
}

/** "job title: Software Developer → Senior Software Developer" */
export function describeChange(entry: AuditEntry): string {
  const fields = Object.keys(entry.changes).filter((f) => f !== 'updated_at');
  if (entry.action !== 'updated' || fields.length === 0) {
    return `${entry.action === 'created' ? 'Added' : entry.action === 'deleted' ? 'Removed' : 'Changed'} ${label(entry.entity)}`;
  }
  return fields.slice(0, 3).map((f) => {
    const { from, to } = entry.changes[f];
    return `${f.replace(/_/g, ' ')}: ${show(from)} → ${show(to)}`;
  }).join(' · ') + (fields.length > 3 ? ` · and ${fields.length - 3} more` : '');
}

const show = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return 'nothing';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
};

const label = (entity: string): string => entity.replace(/_/g, ' ').replace(/s$/, '');
