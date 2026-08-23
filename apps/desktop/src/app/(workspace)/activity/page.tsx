import { activityService, EMPTY_STATES, formatDateTime } from '@snoopy/shared';
import { Card, EmptyState, PageHead } from '@/components/ui';
import { requireCapability } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function ActivityPage() {
  await requireCapability('analytics.view_full');
  const db = await getServerSupabase();
  const entries = await activityService.listActivity(db, 100);

  return (
    <>
      <PageHead title="Activity" subtitle="What has happened across the organisation, most recent first." />
      <Card>
        {entries.length === 0 ? <EmptyState message={EMPTY_STATES.activity} /> : (
          <div className="stack">
            {entries.map((e) => (
              <div key={e.id} className="row-between">
                <span>{activityService.describeActivity(e)}</span>
                <span className="subtle nowrap">{formatDateTime(e.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
