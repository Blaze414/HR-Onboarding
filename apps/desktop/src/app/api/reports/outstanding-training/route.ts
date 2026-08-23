import { analyticsService, toCsv } from '@snoopy/shared';
import { requireCapability } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';

/**
 * The outstanding required training list, as a file.
 *
 * Guarded by the same permission as the report it mirrors, and read through the
 * caller's own session so RLS decides the rows — an export must never be a way
 * around the boundary the screen respects.
 */
export async function GET() {
  await requireCapability('report.view_full');
  const db = await getServerSupabase();
  const rows = await analyticsService.listOutstandingRequiredTraining(db);

  const csv = toCsv(rows as unknown as Record<string, unknown>[], [
    { key: 'employee_name', label: 'Employee' },
    { key: 'employee_email', label: 'Email' },
    { key: 'department_name', label: 'Department' },
    { key: 'manager_name', label: 'Manager' },
    { key: 'course_title', label: 'Course' },
    { key: 'due_date', label: 'Due' },
    { key: 'days_overdue', label: 'Days overdue' },
    { key: 'progress', label: 'Progress %' },
    { key: 'status', label: 'Status' },
  ]);

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      // Dated, because this is a point-in-time record: "who was outstanding on
      // the day we ran it" is the thing HR is later asked to evidence.
      'Content-Disposition': `attachment; filename="outstanding-required-training-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
