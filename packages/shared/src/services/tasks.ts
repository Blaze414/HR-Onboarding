import type { Db } from '../supabase';
import type { Task, TaskPriority, TaskStatus } from '../types';
import { logActivity } from './activity';

export interface TaskFilters {
  search?: string;
  status?: TaskStatus | 'All';
  priority?: TaskPriority | 'All';
  assignedTo?: string;
  courseId?: string;
}

const SELECT =
  '*, assignee:profiles!tasks_assigned_to_fkey(id,name), course:courses(id,title)';

export async function listTasks(db: Db, filters: TaskFilters = {}): Promise<Task[]> {
  let query = db.from('tasks').select(SELECT).order('due_date', { ascending: true, nullsFirst: false });
  if (filters.status && filters.status !== 'All') query = query.eq('status', filters.status);
  if (filters.priority && filters.priority !== 'All') query = query.eq('priority', filters.priority);
  if (filters.assignedTo) query = query.eq('assigned_to', filters.assignedTo);
  if (filters.courseId) query = query.eq('course_id', filters.courseId);
  if (filters.search) query = query.ilike('title', `%${filters.search}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Task[];
}

export async function getTask(db: Db, id: string): Promise<Task | null> {
  const { data, error } = await db.from('tasks').select(SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as Task) ?? null;
}

export async function createTask(
  db: Db, organisationId: string, actorId: string, input: Partial<Task> & { title: string },
): Promise<Task> {
  const { data, error } = await db.from('tasks')
    .insert({ ...input, organisation_id: organisationId, created_by: actorId })
    .select(SELECT).single();
  if (error) throw error;
  await logActivity(db, {
    organisationId, actorId, action: 'created_task',
    entityType: 'task', entityId: data.id, metadata: { title: data.title },
  });
  return data as Task;
}

export async function updateTask(db: Db, id: string, patch: Partial<Task>): Promise<Task> {
  const { data, error } = await db.from('tasks').update(patch).eq('id', id).select(SELECT).single();
  if (error) throw error;
  return data as Task;
}

export async function setTaskStatus(
  db: Db, task: Task, status: TaskStatus, actorId: string,
): Promise<Task> {
  const updated = await updateTask(db, task.id, {
    status,
    completed_at: status === 'Completed' ? new Date().toISOString() : null,
  });
  if (status === 'Completed' && task.status !== 'Completed') {
    await logActivity(db, {
      organisationId: task.organisation_id, actorId, action: 'completed_task',
      entityType: 'task', entityId: task.id, metadata: { title: task.title },
    });
  }
  return updated;
}

export async function bulkAssignTasks(db: Db, ids: string[], assignedTo: string) {
  const { error } = await db.from('tasks').update({ assigned_to: assignedTo }).in('id', ids);
  if (error) throw error;
}

export async function deleteTask(db: Db, id: string) {
  const { error } = await db.from('tasks').delete().eq('id', id);
  if (error) throw error;
}
