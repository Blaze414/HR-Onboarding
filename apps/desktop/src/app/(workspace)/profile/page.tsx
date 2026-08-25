import { analyticsService, authService, credentialService, formatDate, formatDateTime } from '@snoopy/shared';
import { ProfileForm } from '@/components/ProfileForm';
import { Avatar, Card, PageHead, ProgressBar, StatusBadge } from '@/components/ui';
import { MyCredentials } from '@/components/MyCredentials';
import { requireCapability, sessionCan } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const session = await requireCapability('employee.view_self');
  const db = await getServerSupabase();
  const [credentials, credentialTypes, signIns] = await Promise.all([
    credentialService.mine(db, session.userId),
    credentialService.listTypes(db),
    authService.listSignIns(db),
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
      {/*
        * A stolen session is the failure this app cannot prevent, only make
        * visible. The person whose account it is knows which of these were
        * them; nobody else does, which is why nobody else can see this list.
        */}
      <Card title="Recent sign-ins">
        {signIns.length === 0 ? (
          <p className="muted">Nothing recorded yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr><th>When</th><th>App and device</th><th>Time zone</th><th>From</th><th>Result</th></tr>
            </thead>
            <tbody>
              {signIns.map((s) => (
                <tr key={s.id}>
                  <td>{formatDateTime(s.at)}</td>
                  <td>{authService.signInSummary(s)}</td>
                  <td>{s.time_zone ?? <span className="subtle">—</span>}</td>
                  <td>{s.ip ?? <span className="subtle">—</span>}</td>
                  <td>
                    {s.succeeded
                      ? <span className="subtle">Signed in</span>
                      : <span className="warn">Failed attempt</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted" style={{ marginTop: 12 }}>
          One history for both apps — a sign in on the phone appears here, and this one
          appears there. Failed attempts are counted wherever they happen: five wrong
          passwords in fifteen minutes and the account stops answering until the window
          passes. The time zone is the one the device reported, not a guess from the
          address.
        </p>
      </Card>

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
