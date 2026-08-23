import { ATTENTION_PROGRESS_THRESHOLD } from '../constants';
import type { Db } from '../supabase';
import type {
  AttentionItem, CoursePerformance, DepartmentProgress, EmployeeProgress, OrganisationProgress,
  OutstandingRequiredTraining,
} from '../types';

/**
 * All analytics come from SQL views (see 20260818000300_analytics.sql) so the
 * aggregation happens in the database rather than by pulling every record into
 * the client. The views run as security_invoker, so RLS still applies.
 *
 * Overall employee progress = 50% course + 25% task + 25% onboarding,
 * with absent components dropped and the remaining weights re-normalised.
 */

export async function getOrganisationProgress(db: Db): Promise<OrganisationProgress | null> {
  const { data, error } = await db.from('organisation_progress').select('*').maybeSingle();
  if (error) throw error;
  return (data as OrganisationProgress) ?? null;
}

export async function listDepartmentProgress(db: Db): Promise<DepartmentProgress[]> {
  const { data, error } = await db.from('department_progress').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as DepartmentProgress[];
}

export async function getDepartmentProgress(db: Db, departmentId: string): Promise<DepartmentProgress | null> {
  const { data, error } = await db.from('department_progress')
    .select('*').eq('department_id', departmentId).maybeSingle();
  if (error) throw error;
  return (data as DepartmentProgress) ?? null;
}

export interface ProgressFilters {
  departmentId?: string | 'All';
  employeeId?: string;
  minProgress?: number;
  maxProgress?: number;
}

export async function listEmployeeProgress(
  db: Db, filters: ProgressFilters = {},
): Promise<EmployeeProgress[]> {
  let query = db.from('employee_progress').select('*').eq('is_active', true);
  if (filters.departmentId && filters.departmentId !== 'All') query = query.eq('department_id', filters.departmentId);
  if (filters.employeeId) query = query.eq('employee_id', filters.employeeId);
  if (filters.minProgress !== undefined) query = query.gte('overall_progress', filters.minProgress);
  if (filters.maxProgress !== undefined) query = query.lte('overall_progress', filters.maxProgress);
  const { data, error } = await query.order('overall_progress', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as EmployeeProgress[];
}

export async function getEmployeeProgress(db: Db, employeeId: string): Promise<EmployeeProgress | null> {
  const { data, error } = await db.from('employee_progress')
    .select('*').eq('employee_id', employeeId).maybeSingle();
  if (error) throw error;
  return (data as EmployeeProgress) ?? null;
}

export async function listCoursePerformance(db: Db): Promise<CoursePerformance[]> {
  const { data, error } = await db.from('course_performance')
    .select('*').neq('status', 'Archived').order('average_progress', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CoursePerformance[];
}

/**
 * "Needs attention" is derived, never stored. Neutral wording on purpose: this
 * is an operational progress indicator, not a performance evaluation.
 */
export function deriveAttention(
  rows: EmployeeProgress[], threshold = ATTENTION_PROGRESS_THRESHOLD,
): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const row of rows) {
    const reasons: string[] = [];
    if (row.overdue_tasks > 0) {
      reasons.push(`${row.overdue_tasks} overdue task${row.overdue_tasks === 1 ? '' : 's'}`);
    }
    if (row.onboarding_status === 'Overdue') reasons.push('onboarding past its target date');
    if (row.pending_courses > 0 && (row.course_progress ?? 0) < threshold) {
      reasons.push(`${row.pending_courses} course${row.pending_courses === 1 ? '' : 's'} not started`);
    }
    if (reasons.length === 0 && (row.overall_progress ?? 100) < threshold) {
      reasons.push(`overall progress ${row.overall_progress}%`);
    }
    if (reasons.length > 0) {
      items.push({ employee_id: row.employee_id, name: row.name, reason: reasons.join(' · ') });
    }
  }
  return items;
}

export function deriveDepartmentAttention(
  departments: DepartmentProgress[], threshold = ATTENTION_PROGRESS_THRESHOLD,
) {
  return departments
    .filter((d) => d.employees > 0 && (d.overall_progress < threshold || d.overdue_tasks > 0))
    .map((d) => ({
      department_id: d.department_id,
      name: d.name,
      reason: [
        d.course_progress < threshold ? `course completion ${d.course_progress}%` : null,
        d.overdue_tasks > 0 ? `${d.overdue_tasks} overdue task${d.overdue_tasks === 1 ? '' : 's'}` : null,
      ].filter(Boolean).join(' · '),
    }));
}

/**
 * Who has not finished their required training, worst first.
 *
 * This is the question an HR coordinator is asked most often, and the one the
 * completion-rate reports cannot answer: a course at 80% tells you nothing about
 * which four people are the missing 20%.
 */
export async function listOutstandingRequiredTraining(
  db: Db,
  departmentId?: string,
): Promise<OutstandingRequiredTraining[]> {
  let query = db
    .from('outstanding_required_training')
    .select('*')
    .order('is_overdue', { ascending: false })
    .order('due_date', { ascending: true });
  if (departmentId) query = query.eq('department_id', departmentId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as OutstandingRequiredTraining[];
}
