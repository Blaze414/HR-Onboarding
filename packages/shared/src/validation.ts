import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const courseSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().max(1000).optional().nullable(),
  status: z.enum(['Pending', 'In Progress', 'Completed', 'Archived']),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
}).refine(
  (v) => !v.start_date || !v.end_date || v.start_date <= v.end_date,
  { message: 'End date must be after the start date', path: ['end_date'] },
);

export const taskSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().max(1000).optional().nullable(),
  assigned_to: z.string().uuid('Select who is responsible').nullable(),
  course_id: z.string().uuid().optional().nullable(),
  status: z.enum(['Pending', 'In Progress', 'Completed', 'Overdue']),
  priority: z.enum(['Low', 'Medium', 'High']),
  due_date: z.string().optional().nullable(),
});

export const eventSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().max(1000).optional().nullable(),
  start_time: z.string().min(1, 'Start time is required'),
  end_time: z.string().optional().nullable(),
  location: z.string().max(200).optional().nullable(),
}).refine(
  (v) => !v.end_time || v.start_time <= v.end_time,
  { message: 'End time must be after the start time', path: ['end_time'] },
);

export const employeeSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  email: z.string().email('Enter a valid email address'),
  role: z.enum(['employee', 'admin']),
  job_title: z.string().max(120).optional().nullable(),
  department_id: z.string().uuid().optional().nullable(),
  manager_id: z.string().uuid().optional().nullable(),
  start_date: z.string().optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
});

export const templateSchema = z.object({
  name: z.string().min(3, 'Template name is required'),
  description: z.string().max(500).optional().nullable(),
});

export const templateStepSchema = z.object({
  title: z.string().min(2, 'Step title is required'),
  description: z.string().max(500).optional().nullable(),
  type: z.enum(['Task', 'Document', 'Course', 'Meeting', 'Form']),
  required: z.boolean(),
});

export const documentSchema = z.object({
  name: z.string().min(1, 'Document name is required'),
  category: z.string().min(1, 'Choose a category'),
  description: z.string().max(500).optional().nullable(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CourseInput = z.infer<typeof courseSchema>;
export type TaskInput = z.infer<typeof taskSchema>;
export type EventInput = z.infer<typeof eventSchema>;
export type EmployeeInput = z.infer<typeof employeeSchema>;
export type TemplateInput = z.infer<typeof templateSchema>;
export type TemplateStepInput = z.infer<typeof templateStepSchema>;

/** Flattens a Zod error into { field: message } for form rendering. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
