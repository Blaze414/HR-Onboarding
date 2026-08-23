import type { Db } from '../supabase';
import type { ActivityEntry } from '../types';

export type ActivityAction =
  | 'created_course' | 'updated_course' | 'assigned_course' | 'completed_course'
  | 'created_task' | 'completed_task'
  | 'created_event'
  | 'uploaded_document'
  | 'created_employee'
  | 'started_onboarding' | 'completed_onboarding_step' | 'completed_onboarding';

/**
 * Activity is an organisation-scoped historical record, not personal content.
 * Logging never blocks the action that produced it.
 */
export async function logActivity(
  db: Db,
  input: {
    organisationId: string;
    actorId: string;
    action: ActivityAction;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await db.from('activity_log').insert({
    organisation_id: input.organisationId,
    actor_id: input.actorId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    metadata: input.metadata ?? {},
  });
  if (error) console.warn('[activity] could not record activity:', error.message);
}

export async function listActivity(db: Db, limit = 20): Promise<ActivityEntry[]> {
  const { data, error } = await db
    .from('activity_log')
    .select('*, actor:profiles!activity_log_actor_id_fkey(id,name)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ActivityEntry[];
}

export async function listActivityForEmployee(
  db: Db, employeeId: string, limit = 20,
): Promise<ActivityEntry[]> {
  const { data, error } = await db
    .from('activity_log')
    .select('*, actor:profiles!activity_log_actor_id_fkey(id,name)')
    .eq('actor_id', employeeId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ActivityEntry[];
}

const LABELS: Record<string, string> = {
  created_course: 'created a course',
  updated_course: 'updated a course',
  assigned_course: 'assigned a course',
  completed_course: 'completed a course',
  created_task: 'created a task',
  completed_task: 'completed a task',
  created_event: 'created an event',
  uploaded_document: 'uploaded a document',
  created_employee: 'added an employee',
  started_onboarding: 'started an onboarding plan',
  completed_onboarding_step: 'completed an onboarding step',
  completed_onboarding: 'completed onboarding',
};

export function describeActivity(entry: ActivityEntry): string {
  const who = entry.actor?.name ?? 'Someone';
  const what = LABELS[entry.action] ?? entry.action.replace(/_/g, ' ');
  const subject = (entry.metadata?.title ?? entry.metadata?.name ?? entry.metadata?.employee) as string | undefined;
  return subject ? `${who} ${what} — ${subject}` : `${who} ${what}`;
}
