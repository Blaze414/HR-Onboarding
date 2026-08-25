import Link from 'next/link';
import { employeeService, formatDateTime, securityService, type WorkspaceSignIn } from '@snoopy/shared';
import { SelectFilter } from '@/components/Filters';
import { EmptyState, PageHead, StatusBadge, TableCard, Tabs } from '@/components/ui';
import { requireCapability } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const VIEWS = [
  { key: 'sign-ins', label: 'Sign-ins' },
  { key: 'actions', label: 'What was done' },
  { key: 'looks', label: 'Who looked at this' },
] as const;

/**
 * Session and activity monitoring, for the one role that answers for it.
 *
 * This page exists for the hour after somebody says "I think we have had a
 * breach". It answers the three questions that hour consists of — whose
 * account, from where, and what was touched — and it answers them from records
 * the database wrote, not from records the application remembered to write.
 *
 * Opening it requires saying why, and the saying is itself recorded, on the
 * third tab, where the people being investigated can see it. That is not
 * ceremony: an investigative power nobody can audit is indistinguishable from
 * surveillance, and the people most able to abuse this page are the only ones
 * who can see it.
 */
export default async function SecurityPage({
  searchParams,
}: { searchParams: Promise<{ view?: string; person?: string; reason?: string }> }) {
  const { view = 'sign-ins', person, reason } = await searchParams;

  // The capability that defines a Super Administrator: the only role that can
  // change its own access, and so the only one trusted with everybody's.
  await requireCapability('user.role_management_self');
  const db = await getServerSupabase();

  if (!reason?.trim()) {
    return (
      <>
        <PageHead
          title="Session and activity monitoring"
          subtitle="Sign-ins and every change made in this workspace, kept by the database rather than by the app."
        />
        <div className="card" style={{ maxWidth: 640, padding: 24 }}>
          <h2 style={{ marginTop: 0 }}>Say why you are looking</h2>
          <p className="muted">
            This shows every person&rsquo;s sign-ins and every change anyone has made.
            Looking is recorded against your name, with this reason, and the people
            you look at can see that you looked. Both of those are on purpose.
          </p>
          <form method="get" className="stack" style={{ marginTop: 16 }}>
            <input type="hidden" name="view" value={view} />
            <input
              className="input" name="reason" required maxLength={300}
              placeholder="Investigating a suspected breach reported on 25 August"
            />
            <button className="btn btn-primary" type="submit">Open the record</button>
          </form>
        </div>
      </>
    );
  }

  // Recorded before anything is read: a look that failed halfway through is
  // still a look.
  await securityService.recordLogRead(db, reason, person);

  const [people, signIns, audit, looks] = await Promise.all([
    employeeService.listEmployees(db),
    view === 'sign-ins' ? securityService.listWorkspaceSignIns(db, { personId: person }) : [],
    view === 'actions' ? securityService.listAudit(db, { actorId: person }) : [],
    view === 'looks' ? securityService.listLogReads(db) : [],
  ]);

  const query = { view, reason, ...(person ? { person } : {}) };

  return (
    <>
      <PageHead
        title="Session and activity monitoring"
        subtitle={`Looking because: ${reason}`}
      />

      <Tabs
        tabs={VIEWS.map((v) => ({
          href: `/security?${new URLSearchParams({ ...query, view: v.key })}`,
          label: v.label,
        }))}
        current={`/security?${new URLSearchParams(query)}`}
      />

      {view !== 'looks' ? (
        <div className="row" style={{ margin: '16px 0' }}>
          {/* The filter keeps the rest of the query, so the reason travels
              with it and the look stays attributed to the same investigation. */}
          <SelectFilter
            name="person"
            label={view === 'sign-ins' ? 'Whose account' : 'Who did it'}
            options={people.map((p) => ({ value: p.id, label: p.name }))}
            allLabel="Everybody"
          />
          {person ? (
            <Link className="btn btn-sm btn-ghost" href={`/security?${new URLSearchParams({ view, reason })}`}>
              Clear
            </Link>
          ) : null}
          <a
            className="btn btn-sm"
            href={`/api/security/export?${new URLSearchParams(query)}`}
            download
          >
            Export CSV
          </a>
        </div>
      ) : null}

      {view === 'sign-ins' ? (
        <TableCard title={`${signIns.length} attempts`}>
          {signIns.length === 0 ? <EmptyState message="Nothing recorded." /> : (
            <table className="table">
              <thead>
                <tr>
                  <th>When</th><th>Who</th><th>App and device</th>
                  <th>Time zone</th><th>From</th><th>Result</th>
                </tr>
              </thead>
              <tbody>
                {signIns.map((s) => (
                  <tr key={s.id}>
                    <td>{formatDateTime(s.at)}</td>
                    <td>
                      {s.person
                        ? <Link href={`/employees/${s.person.id}`}>{s.person.name}</Link>
                        : <span className="subtle">—</span>}
                    </td>
                    <td>{describeSignIn(s)}</td>
                    <td>{s.time_zone ?? <span className="subtle">—</span>}</td>
                    <td>{s.ip ?? <span className="subtle">—</span>}</td>
                    <td>
                      {s.succeeded
                        ? <span className="subtle">Signed in</span>
                        : <span className="warn">Failed</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TableCard>
      ) : null}

      {view === 'actions' ? (
        <TableCard title={`${audit.length} changes`}>
          {audit.length === 0 ? <EmptyState message="Nothing recorded." /> : (
            <table className="table">
              <thead>
                <tr><th>When</th><th>Who</th><th>What</th><th>About</th><th>Change</th></tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td>{formatDateTime(a.at)}</td>
                    {/* No actor means it was not a person: a scheduled job, a
                        migration, or the service key. Worth showing, not hiding. */}
                    <td>{a.actor?.name ?? <span className="subtle">System</span>}</td>
                    <td><StatusBadge status={a.action} /> {a.entity.replace(/_/g, ' ')}</td>
                    <td>
                      {a.subject
                        ? <Link href={`/employees/${a.subject.id}`}>{a.subject.name}</Link>
                        : <span className="subtle">—</span>}
                    </td>
                    <td>{securityService.describeChange(a)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TableCard>
      ) : null}

      {view === 'looks' ? (
        <TableCard title={`${looks.length} looks at this record`}>
          {looks.length === 0 ? <EmptyState message="Nobody has opened this page." /> : (
            <table className="table">
              <thead><tr><th>When</th><th>Who</th><th>Why</th></tr></thead>
              <tbody>
                {looks.map((l) => (
                  <tr key={l.id}>
                    <td>{formatDateTime(l.at)}</td>
                    <td>{l.reader?.name ?? <span className="subtle">—</span>}</td>
                    <td>{l.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TableCard>
      ) : null}
    </>
  );
}

function describeSignIn(s: WorkspaceSignIn): string {
  if (s.client && s.device) return `${s.client} · ${s.device}`;
  if (s.client) return s.client;
  return s.succeeded ? 'An app that did not identify itself' : 'Unknown device';
}
