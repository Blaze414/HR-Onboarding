import type { Db } from '../supabase';
import type { CourseAssignment, EmployeeOnboarding, Task, WorkEvent } from '../types';
import { listMyAssignments } from './courses';
import { listEvents } from './events';
import { getMyOnboarding } from './onboarding';
import { listTasks } from './tasks';

export interface EmployeeDashboard {
  assignments: CourseAssignment[];
  totalCourses: number;
  completedCourses: number;
  inProgressCourses: number;
  pendingCourses: number;
  courseProgress: number;
  tasks: Task[];
  outstandingTasks: number;
  overdueTasks: number;
  upcomingEvents: WorkEvent[];
  documentCount: number;
  onboarding: EmployeeOnboarding | null;
}

/**
 * Every figure here is derived from live records — nothing on the dashboard is
 * a hardcoded number.
 */
export async function loadEmployeeDashboard(db: Db, userId: string): Promise<EmployeeDashboard> {
  const [assignments, tasks, events, onboarding, documents] = await Promise.all([
    listMyAssignments(db, userId),
    listTasks(db, { assignedTo: userId }),
    listEvents(db, { upcomingOnly: true }),
    getMyOnboarding(db, userId),
    db.from('documents').select('id', { count: 'exact', head: true }),
  ]);

  const completedCourses = assignments.filter((a) => a.status === 'Completed').length;
  const inProgressCourses = assignments.filter((a) => a.status === 'In Progress').length;
  const pendingCourses = assignments.filter((a) => a.status === 'Pending').length;
  const courseProgress = assignments.length === 0
    ? 0
    : Math.round(assignments.reduce((sum, a) => sum + a.progress, 0) / assignments.length);

  const today = new Date().toISOString().slice(0, 10);

  return {
    assignments,
    totalCourses: assignments.length,
    completedCourses,
    inProgressCourses,
    pendingCourses,
    courseProgress,
    tasks,
    outstandingTasks: tasks.filter((t) => t.status !== 'Completed').length,
    overdueTasks: tasks.filter((t) => t.status !== 'Completed' && t.due_date !== null && t.due_date < today).length,
    upcomingEvents: events.slice(0, 5),
    documentCount: documents.count ?? 0,
    onboarding,
  };
}

export interface AdminCounts {
  employees: number;
  courses: number;
  openTasks: number;
  activeOnboarding: number;
  upcomingEvents: number;
  documents: number;
}

export async function loadAdminCounts(db: Db): Promise<AdminCounts> {
  const head = { count: 'exact' as const, head: true };
  const [employees, courses, openTasks, onboarding, events, documents] = await Promise.all([
    db.from('profiles').select('id', head).eq('is_active', true),
    db.from('courses').select('id', head).neq('status', 'Archived'),
    db.from('tasks').select('id', head).neq('status', 'Completed'),
    db.from('employee_onboarding').select('id', head).neq('status', 'Completed'),
    db.from('events').select('id', head).gte('start_time', new Date().toISOString()),
    db.from('documents').select('id', head),
  ]);
  return {
    employees: employees.count ?? 0,
    courses: courses.count ?? 0,
    openTasks: openTasks.count ?? 0,
    activeOnboarding: onboarding.count ?? 0,
    upcomingEvents: events.count ?? 0,
    documents: documents.count ?? 0,
  };
}
