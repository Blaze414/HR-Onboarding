import { analyticsService, credentialService, formatDate } from '@snoopy/shared';
import { ProfileForm } from '@/components/ProfileForm';
import { Avatar, Card, PageHead, ProgressBar, StatusBadge } from '@/components/ui';
import { MyCredentials } from '@/components/MyCredentials';
import { requireCapability, sessionCan } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const session = await requireCapability('employee.view_self');
  const db = await getServerSupabase();
  const [credentials, credentialTypes] = await Promise.all([
    credentialService.mine(db, session.userId),
    credentialService.listTypes(db),
  ]);
  const progress = await analyticsService.getEmployeeProgress(db, session.userId);
  const p = session.profile;

  return (
    <>
      <PageHead title="Profile" subtitle="Your details, and how your own work is tracking." />

      <div className="grid grid-2">
        <Card title="Your details">
          <div className="row" style={{ marginBottom: 16 }}>
            <Avatar name={p.name} large />
            <div>
              <div style={{ fontWeight: 600 }}>{p.name}</div>
              <div className="subtle">{p.email}</div>
            </div>
          </div>
          <ProfileForm profile={p} />
        </Card>

        <div className="stack">
          <Card title="Workplace">
            <dl className="dl">
              <dt>Role</dt><dd><StatusBadge status={p.role} /></dd>
              <dt>Job title</dt><dd>{p.job_title ?? '—'}</dd>
              <dt>Department</dt><dd>{p.department?.name ?? '—'}</dd>
              <dt>Manager</dt><dd>{p.manager?.name ?? '—'}</dd>
              <dt>Start date</dt><dd>{formatDate(p.start_date)}</dd>
            </dl>
          </Card>

          <Card title="My progress">
            <div className="stack">
              <Row label="Courses" value={progress?.course_progress ?? null} />
              <Row label="Tasks" value={progress?.task_progress ?? null} />
              <Row label="Onboarding" value={progress?.onboarding_progress ?? null} />
              <Row label="Overall" value={progress?.overall_progress ?? null} />
            </div>
          </Card>
        </div>
      </div>
      <MyCredentials
        credentials={credentials}
        types={credentialTypes}
        organisationId={session.organisationId}
        employeeId={session.userId}
        canSubmit={sessionCan(session, 'credential.submit')}
      />
    </>
  );
}

function Row({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="row-between">
      <span className="muted" style={{ minWidth: 110 }}>{label}</span>
      <div style={{ flex: 1 }}><ProgressBar value={value} /></div>
    </div>
  );
}
