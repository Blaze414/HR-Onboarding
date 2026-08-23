import type { Db } from '../supabase';
import type { CourseAssignment, EmployeeProgress, Profile, Task } from '../types';

/**
 * A manager's view of their own team.
 *
 * Every query here is scoped by the database rather than by these filters: the
 * reporting-line policies decide which rows come back, so a manager asking for
 * somebody else's team receives nothing rather than an error.
 */
export const teamService = {
  async listReports(db: Db, managerId: string): Promise<Profile[]> {
    const { data, error } = await db
      .from('profiles')
      .select('*, department:departments!profiles_department_id_fkey(id,name)')
      .eq('manager_id', managerId)
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return (data ?? []) as Profile[];
  },

  /** Progress for the manager's reports, using the same figures HR sees. */
  async teamProgress(db: Db, managerId: string): Promise<EmployeeProgress[]> {
    const reports = await teamService.listReports(db, managerId);
    if (reports.length === 0) return [];
    const { data, error } = await db
      .from('employee_progress')
      .select('*')
      .in('employee_id', reports.map((r) => r.id));
    if (error) throw error;
    return (data ?? []) as EmployeeProgress[];
  },

  async teamRequiredTraining(db: Db, managerId: string): Promise<CourseAssignment[]> {
    const reports = await teamService.listReports(db, managerId);
    if (reports.length === 0) return [];
    const { data, error } = await db
      .from('course_assignments')
      .select('*, course:courses(*), user:profiles!course_assignments_user_id_fkey(id,name,job_title)')
      .in('user_id', reports.map((r) => r.id))
      .eq('is_required', true)
      .neq('status', 'Completed')
      .order('due_date');
    if (error) throw error;
    return (data ?? []) as CourseAssignment[];
  },

  async teamOpenTasks(db: Db, managerId: string): Promise<Task[]> {
    const reports = await teamService.listReports(db, managerId);
    if (reports.length === 0) return [];
    const { data, error } = await db
      .from('tasks')
      .select('*, assignee:profiles!tasks_assigned_to_fkey(id,name)')
      .in('assigned_to', reports.map((r) => r.id))
      .neq('status', 'Completed')
      .order('due_date');
    if (error) throw error;
    return (data ?? []) as Task[];
  },
};
