import { documentRequestService, toCsv } from '@snoopy/shared';
import { requireCapability } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';

/** Which documents are still owed, and by whom. */
export async function GET() {
  await requireCapability('report.view_full');
  const db = await getServerSupabase();
  const rows = await documentRequestService.outstanding(db);

  const csv = toCsv(rows as unknown as Record<string, unknown>[], [
    { key: 'employee_name', label: 'Employee' },
    { key: 'employee_email', label: 'Email' },
    { key: 'department_name', label: 'Department' },
    { key: 'manager_name', label: 'Manager' },
    { key: 'title', label: 'Document' },
    { key: 'due_date', label: 'Due' },
    { key: 'status', label: 'Status' },
  ]);

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="outstanding-documents-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
