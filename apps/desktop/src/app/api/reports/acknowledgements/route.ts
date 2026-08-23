import { acknowledgementService, toCsv } from '@snoopy/shared';
import { requireCapability } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';

/** Who still owes an acknowledgement, as a file. */
export async function GET() {
  await requireCapability('report.view_full');
  const db = await getServerSupabase();
  const rows = await acknowledgementService.outstanding(db);

  const csv = toCsv(rows as unknown as Record<string, unknown>[], [
    { key: 'document_name', label: 'Document' },
    { key: 'employee_name', label: 'Employee' },
    { key: 'employee_email', label: 'Email' },
    { key: 'manager_name', label: 'Manager' },
    { key: 'published_at', label: 'Published' },
  ]);

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="outstanding-acknowledgements-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
