import Link from 'next/link';
import { EMPTY_STATES, eventService, formatDateTime } from '@snoopy/shared';
import { EventCalendar } from '@/components/EventCalendar';
import { ClearFilters, SearchInput, SelectFilter } from '@/components/Filters';
import { Icon } from '@/components/Icon';
import { EmptyState, PageHead, StatusBadge, Tabs, TableCard } from '@/components/ui';
import { requireCapability, sessionCan } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function EventsPage({
  searchParams,
}: { searchParams: Promise<{ q?: string; when?: string; view?: string }> }) {
  const { q, when, view = 'calendar' } = await searchParams;
  const session = await requireCapability('event.view');
  const db = await getServerSupabase();
  const canCreate = sessionCan(session, 'event.create');

  // The calendar needs the full range so past months stay populated; the list
  // defaults to what is still ahead.
  const events = await eventService.listEvents(db, {
    search: q,
    upcomingOnly: view === 'list' && when !== 'past' && when !== 'All',
  });
  const rows = when === 'past'
    ? events.filter((e) => new Date(e.start_time) < new Date())
    : events;

  return (
    <>
      <PageHead
        title="Events"
        subtitle="Workshops, sessions and meetings across the organisation."
        actions={canCreate ? (
          <Link className="btn btn-primary" href="/events/new"><Icon name="plus" size={16} /> New event</Link>
        ) : null}
      />

      <Tabs
        tabs={[
          { href: '/events', label: 'Calendar' },
          { href: '/events?view=list', label: 'List' },
        ]}
        current={view === 'list' ? '/events?view=list' : '/events'}
      />

      {view === 'list' ? (
        <>
          <div className="toolbar">
            <SearchInput placeholder="Search events…" />
            <SelectFilter
              name="when" label="When" allLabel="Upcoming"
              options={[{ value: 'past', label: 'Past events' }, { value: 'All', label: 'All events' }]}
            />
            <ClearFilters />
          </div>

          <TableCard>
            <table className="table">
              <thead>
                <tr><th>Event</th><th>Starts</th><th>Location</th><th className="num">Participants</th><th>My response</th></tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const mine = e.participants?.find((p) => p.user_id === session.userId);
                  return (
                    <tr key={e.id}>
                      <td>
                        <Link className="link" href={`/events/${e.id}`}>{e.title}</Link>
                        {e.description ? <div className="subtle truncate" style={{ maxWidth: 340 }}>{e.description}</div> : null}
                      </td>
                      <td className="subtle nowrap">{formatDateTime(e.start_time)}</td>
                      <td className="subtle">{e.location ?? '—'}</td>
                      <td className="num">{e.participants?.length ?? 0}</td>
                      <td>{mine?.response ? <StatusBadge status={mine.response} /> : <span className="subtle">No response</span>}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 ? (
                  <tr><td colSpan={5}><EmptyState message={EMPTY_STATES.events} /></td></tr>
                ) : null}
              </tbody>
            </table>
          </TableCard>
        </>
      ) : (
        <EventCalendar events={events} userId={session.userId} canCreate={canCreate} />
      )}
    </>
  );
}
