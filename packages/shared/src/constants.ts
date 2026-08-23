import type { CourseStatus, StepType, TaskPriority, TaskStatus } from './types';

export const PRODUCT_NAME = 'Snoopy Workplace';
export const PRODUCT_SUBTITLE = 'People, Learning & Work Hub';

export const COURSE_STATUSES: CourseStatus[] = ['Pending', 'In Progress', 'Completed', 'Archived'];
export const TASK_STATUSES: TaskStatus[] = ['Pending', 'In Progress', 'Completed', 'Overdue'];
export const TASK_PRIORITIES: TaskPriority[] = ['Low', 'Medium', 'High'];
export const STEP_TYPES: StepType[] = ['Task', 'Document', 'Course', 'Meeting', 'Form'];

export const DOCUMENT_CATEGORIES = [
  'HR Documents',
  'Course Material',
  'Shared',
  'Policies',
  'General',
];

export const DOCUMENTS_BUCKET = 'documents';

/** Employees below this overall progress are surfaced under "Needs Attention". */
export const ATTENTION_PROGRESS_THRESHOLD = 60;

export const EMPTY_STATES = {
  tasks: "You're all caught up! Snoopy approves.",
  documents: "Snoopy couldn't find anything here yet.",
  onboardingComplete: 'Great work! Snoopy approves.',
  courses: 'No courses are assigned to you yet.',
  events: 'Nothing in the calendar right now.',
  activity: 'No activity recorded yet.',
  employees: 'No employees match these filters.',
} as const;
