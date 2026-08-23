import type { Db } from '../supabase';
import type {
  AssignmentStatus, AwaitingVerification, Course, CourseAssignment, CourseStatus,
} from '../types';
import { logActivity } from './activity';

export interface CourseFilters {
  search?: string;
  status?: CourseStatus | 'All';
  includeArchived?: boolean;
}

export async function listCourses(db: Db, filters: CourseFilters = {}): Promise<Course[]> {
  let query = db.from('courses').select('*').order('created_at', { ascending: false });
  if (filters.status && filters.status !== 'All') query = query.eq('status', filters.status);
  else if (!filters.includeArchived) query = query.neq('status', 'Archived');
  if (filters.search) query = query.ilike('title', `%${filters.search}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Course[];
}

export async function getCourse(db: Db, id: string): Promise<Course | null> {
  const { data, error } = await db.from('courses').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as Course) ?? null;
}

export async function createCourse(
  db: Db,
  organisationId: string,
  actorId: string,
  input: Partial<Course> & { title: string },
): Promise<Course> {
  const { data, error } = await db.from('courses')
    .insert({ ...input, organisation_id: organisationId, created_by: actorId })
    .select('*').single();
  if (error) throw error;
  await logActivity(db, {
    organisationId, actorId, action: 'created_course',
    entityType: 'course', entityId: data.id, metadata: { title: data.title },
  });
  return data as Course;
}

export async function updateCourse(db: Db, id: string, patch: Partial<Course>): Promise<Course> {
  const { data, error } = await db.from('courses').update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  return data as Course;
}

export async function archiveCourse(db: Db, id: string) {
  return updateCourse(db, id, { status: 'Archived' });
}

export async function restoreCourse(db: Db, id: string) {
  return updateCourse(db, id, { status: 'In Progress' });
}

// ------------------------------------------------------------- assignments
export async function listMyAssignments(db: Db, userId: string): Promise<CourseAssignment[]> {
  const { data, error } = await db
    .from('course_assignments')
    .select('*, course:courses(*)')
    .eq('user_id', userId)
    .order('assigned_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CourseAssignment[];
}

export async function listCourseLearners(db: Db, courseId: string): Promise<CourseAssignment[]> {
  const { data, error } = await db
    .from('course_assignments')
    .select('*, user:profiles!course_assignments_user_id_fkey(id,name,job_title)')
    .eq('course_id', courseId)
    .order('assigned_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CourseAssignment[];
}

function statusForProgress(progress: number): AssignmentStatus {
  if (progress >= 100) return 'Completed';
  if (progress > 0) return 'In Progress';
  return 'Pending';
}

/** A learner moving their own progress along. RLS restricts this to their own row. */
export async function updateAssignmentProgress(
  db: Db,
  assignment: CourseAssignment,
  progress: number,
  actorId: string,
): Promise<CourseAssignment> {
  const clamped = Math.max(0, Math.min(100, Math.round(progress)));
  const status = statusForProgress(clamped);
  const { data, error } = await db.from('course_assignments')
    .update({
      progress: clamped,
      status,
      completed_at: status === 'Completed' ? new Date().toISOString() : null,
    })
    .eq('id', assignment.id)
    .select('*, course:courses(*)')
    .single();
  if (error) throw error;

  if (status === 'Completed' && assignment.status !== 'Completed') {
    await logActivity(db, {
      organisationId: assignment.organisation_id, actorId, action: 'completed_course',
      entityType: 'course', entityId: assignment.course_id,
      metadata: { title: (data as CourseAssignment).course?.title },
    });
  }
  return data as CourseAssignment;
}

/** Admin assignment. Existing assignments are left untouched. */
export async function assignCourse(
  db: Db, organisationId: string, actorId: string, courseId: string, userIds: string[],
  options: { required?: boolean; dueDate?: string | null } = {},
): Promise<number> {
  if (userIds.length === 0) return 0;
  const rows = userIds.map((user_id) => ({
    organisation_id: organisationId, course_id: courseId, user_id, assigned_by: actorId,
    is_required: options.required ?? false,
    due_date: options.dueDate || null,
  }));
  const { data, error } = await db.from('course_assignments')
    .upsert(rows, { onConflict: 'course_id,user_id', ignoreDuplicates: true })
    .select('id');
  if (error) throw error;
  await logActivity(db, {
    organisationId, actorId, action: 'assigned_course',
    entityType: 'course', entityId: courseId, metadata: { learners: userIds.length },
  });
  return data?.length ?? 0;
}

export async function unassignCourse(db: Db, assignmentId: string) {
  const { error } = await db.from('course_assignments').delete().eq('id', assignmentId);
  if (error) throw error;
}

/**
 * Assigns a course to everyone currently in a department.
 *
 * Required training that has to be given out one person at a time does not
 * survive a real headcount — the list is fetched at the moment of assigning
 * rather than stored, so this is a snapshot of the department, not a standing
 * rule. Someone who joins tomorrow is not assigned retrospectively.
 */
export async function listDepartmentMembers(
  db: Db, departmentId: string,
): Promise<{ id: string; name: string }[]> {
  const { data, error } = await db
    .from('profiles')
    .select('id, name')
    .eq('department_id', departmentId)
    .eq('is_active', true);
  if (error) throw error;
  return (data ?? []) as { id: string; name: string }[];
}

/**
 * Records that somebody with authority confirmed the training was done.
 *
 * Kept separate from the learner's own progress figure: one is a self-report,
 * the other is the evidence. Passing `null` withdraws the confirmation, which
 * has to be possible — verifying the wrong row otherwise stands forever.
 */
export async function setVerification(
  db: Db, assignmentId: string, verifierId: string | null,
): Promise<void> {
  const { error } = await db
    .from('course_assignments')
    .update({
      verified_at: verifierId ? new Date().toISOString() : null,
      verified_by: verifierId,
    })
    .eq('id', assignmentId);
  if (error) throw error;
}

export async function listAwaitingVerification(db: Db): Promise<AwaitingVerification[]> {
  const { data, error } = await db
    .from('awaiting_verification')
    .select('*')
    .order('completed_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as AwaitingVerification[];
}
