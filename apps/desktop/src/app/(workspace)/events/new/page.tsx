import { employeeService } from '@snoopy/shared';
import { EventForm } from '@/components/EventForm';
import { PageHead } from '@/components/ui';
import { requireAdmin } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function NewEventPage({
  searchParams,
}: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  await requireAdmin();
  const db = await getServerSupabase();
  const employees = await employeeService.listEmployees(db, { activeOnly: true });
  return (
    <>
      <PageHead title="New event" subtitle="It appears on the calendar as soon as you save." />
      <section className="card"><div className="card-body">
        <EventForm employees={employees} initialDate={date} />
      </div></section>
    </>
  );
}
