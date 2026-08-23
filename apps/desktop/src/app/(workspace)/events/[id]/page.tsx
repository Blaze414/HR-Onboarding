import { notFound } from 'next/navigation';
import { employeeService, eventService, formatDateTime } from '@snoopy/shared';
import { EventForm } from '@/components/EventForm';
import { ActionButton } from '@/components/Interactive';
import { RsvpControl } from '@/components/RsvpControl';
import { Card, EmptyState, PageHead, Person, StatusBadge, Tabs } from '@/components/ui';
import { deleteEventAction } from '@/lib/actions';
import { requireSession } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function EventDetailPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab = 'overview' } = await searchParams;
  const session = await requireSession();
  const db = await getServerSupabase();
  const isAdmin = session.profile.role === 'admin';

  const event = await eventService.getEvent(db, id);
  if (!event) notFound();

  const mine = event.participants?.find((p) => p.user_id === session.userId);
  const employees = isAdmin ? await employeeService.listEmployees(db, { activeOnly: true }) : [];

  return (
    <>
      <PageHead
        title={event.title}
        subtitle={event.description ?? undefined}
        actions={isAdmin ? (
          <ActionButton
            label="Delete event" icon="trash" variant="danger" small={false}
            confirm="Delete this event? Participants lose their invitation."
            action={deleteEventAction.bind(null, id)}
          />
        ) : null}
      />

      {isAdmin ? (
        <Tabs
          tabs={[
            { href: `/events/${id}`, label: 'Overview' },
            { href: `/events/${id}?tab=edit`, label: 'Edit & participants' },
          ]}
          current={tab === 'overview' ? `/events/${id}` : `/events/${id}?tab=edit`}
        />
      ) : null}

      {tab === 'edit' && isAdmin ? (
        <section className="card"><div className="card-body">
          <EventForm
            event={event}
            employees={employees}
            initialParticipants={(event.participants ?? []).map((p) => p.user_id)}
          />
        </div></section>
      ) : (
        <div className="grid grid-2">
          <Card title="Event details">
            <dl className="dl">
              <dt>Starts</dt><dd>{formatDateTime(event.start_time)}</dd>
              <dt>Ends</dt><dd>{formatDateTime(event.end_time)}</dd>
              <dt>Location</dt><dd>{event.location ?? '—'}</dd>
              <dt>Participants</dt><dd>{event.participants?.length ?? 0}</dd>
            </dl>
            <div style={{ marginTop: 18 }}>
              <h3 style={{ marginBottom: 10 }}>Your response</h3>
              <RsvpControl eventId={event.id} response={mine?.response ?? null} />
            </div>
          </Card>

          <Card title="Who is coming">
            {(event.participants ?? []).length === 0 ? (
              <EmptyState message="Nobody has been invited yet." />
            ) : (
              <div className="stack">
                {(event.participants ?? []).map((p) => (
                  <div key={p.id} className="row-between">
                    <Person name={p.user?.name ?? 'Unknown'} href={isAdmin ? `/employees/${p.user_id}` : undefined} />
                    {p.response ? <StatusBadge status={p.response} /> : <span className="subtle">No response</span>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
