import Link from 'next/link';
import {
  acknowledgementService, analyticsService, courseService, credentialService, documentRequestService,
  employeeService,
  formatDate, formatDateTime, listSavedViews,
  onboardingService, statementService, taskService,
} from '@snoopy/shared';
import { ClearFilters, SelectFilter } from '@/components/Filters';
import { RecordStatement } from '@/components/RecordStatement';
import { SavedViews } from '@/components/SavedViews';
import { CredentialReview } from '@/components/CredentialReview';
import { VerificationQueue } from '@/components/VerificationQueue';
import { Icon } from '@/components/Icon';
import {
  ApprovedStamp, EmptyState, PageHead, Person, ProgressBar, StatCard, StatusBadge, Tabs, TableCard,
} from '@/components/ui';
import { requireCapability, sessionCan } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/** Reports that actually narrow by department. */
const CREDENTIAL_REPORTS = new Set(['coverage', 'expiring', 'checks']);

const DEPARTMENT_FILTERED = new Set(['required', 'tasks', 'employees', 'documents', 'coverage']);

const REPORTS = [
  // First, because it is the question this report set is opened to answer.
  { key: 'required', label: 'Outstanding required training' },
  { key: 'verify', label: 'Awaiting verification' },
  { key: 'acknowledgements', label: 'Acknowledgements owed' },
  { key: 'statements', label: 'Statements owed' },
  { key: 'documents', label: 'Documents owed' },
  { key: 'coverage', label: 'Who could cover what' },
  { key: 'expiring', label: 'Expiring credentials' },
  { key: 'checks', label: 'Credentials to check' },
  { key: 'courses', label: 'Course completion' },
  { key: 'onboarding', label: 'Onboarding progress' },
  { key: 'tasks', label: 'Outstanding tasks' },
  { key: 'employees', label: 'Employee progress' },
  { key: 'events', label: 'Events' },
] as const;

export default async function ReportsPage({
  searchParams,
}: { searchParams: Promise<{ report?: string; department?: string }> }) {
  const { report = 'required', department } = await searchParams;
  const session = await requireCapability('report.view_full');
  const canSeeCoverage = sessionCan(session, 'credential.view_coverage');
  const db = await getServerSupabase();
  const [departments, savedViews] = await Promise.all([
    employeeService.listDepartments(db),
    listSavedViews(db, '/reports'),
  ]);

  return (
    <>
      <PageHead
        title="Reports"
        subtitle="Point-in-time summaries you can filter and read across. Analytics covers live day-to-day progress."
      />

      <Tabs
        tabs={REPORTS
          // Coverage and expiry read credential records, which is its own grant:
          // knowing who holds which certificate is not the same as reading a
          // training report.
          .filter((r) => !CREDENTIAL_REPORTS.has(r.key) || canSeeCoverage)
          .map((r) => ({ href: `/reports?report=${r.key}`, label: r.label }))}
        current={`/reports?report=${report}`}
      />

      {/*
        * Only shown on the reports that read it. A department filter that sits
        * above a report ignoring it looks broken the first time somebody trusts
        * it — and quietly wrong every time after.
        */}
      {DEPARTMENT_FILTERED.has(report) ? (
        <div className="toolbar">
          <SelectFilter name="department" label="Department" allLabel="All departments"
            options={departments.map((d) => ({ value: d.id, label: d.name }))} />
          <ClearFilters />
        </div>
      ) : null}

      {/*
        * Saved views sit under the filters that make them, because that is
        * where somebody realises they have built this same view before.
        */}
      <SavedViews views={savedViews} ownerId={session.userId} />

      {report === 'required' ? <RequiredTrainingReport db={db} departmentId={department} /> : null}
      {report === 'verify' ? <VerificationReport db={db} /> : null}
      {report === 'acknowledgements' ? <AcknowledgementReport db={db} /> : null}
      {report === 'statements' ? <StatementReport db={db} /> : null}
      {report === 'documents' ? <DocumentRequestReport db={db} departmentId={department} /> : null}
      {report === 'coverage' && canSeeCoverage ? <CoverageReport db={db} departmentId={department} /> : null}
      {report === 'expiring' && canSeeCoverage ? <ExpiringReport db={db} /> : null}
      {report === 'checks' && canSeeCoverage ? <CredentialQueue db={db} /> : null}
      {report === 'courses' ? <CourseReport db={db} /> : null}
      {report === 'onboarding' ? <OnboardingReport db={db} /> : null}
      {report === 'tasks' ? <TaskReport db={db} departmentId={department} /> : null}
      {report === 'employees' ? <EmployeeReport db={db} departmentId={department} /> : null}
      {report === 'events' ? <EventReport db={db} /> : null}
    </>
  );
}

/**
 * Who has not finished their required training.
 *
 * Ordered worst-first and stating who each person reports to, because the next
 * action after reading this is almost always to ask a specific manager to chase
 * a specific person.
 */
async function RequiredTrainingReport({ db, departmentId }: { db: any; departmentId?: string }) {
  const rows = await analyticsService.listOutstandingRequiredTraining(db, departmentId);
  const overdue = rows.filter((r) => r.is_overdue);

  return (
    <TableCard
      title={`${rows.length} outstanding · ${overdue.length} overdue`}
      action={
        <a className="btn btn-sm" href="/api/reports/outstanding-training" download>
          <Icon name="download" size={15} /> Export CSV
        </a>
      }
    >
      <table className="table">
        <thead>
          <tr>
            <th>Employee</th><th>Course</th><th>Department</th><th>Manager</th>
            <th>Due</th><th className="num">Progress</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.assignment_id}>
              <td><Person name={r.employee_name} meta={r.employee_email} href={`/employees/${r.employee_id}`} /></td>
              <td><Link className="link" href={`/courses/${r.course_id}`}>{r.course_title}</Link></td>
              <td className="subtle">{r.department_name ?? '—'}</td>
              <td className="subtle">{r.manager_name ?? '—'}</td>
              <td className="nowrap">
                <span className={`req req-${r.is_overdue ? 'overdue' : 'due_soon'}`}>
                  {r.is_overdue
                    ? `${r.days_overdue} ${r.days_overdue === 1 ? 'day' : 'days'} overdue`
                    : `Due ${formatDate(r.due_date)}`}
                </span>
              </td>
              <td className="num"><ProgressBar value={r.progress} /></td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr><td colSpan={6}><EmptyState message="Nothing outstanding. Every required course is complete." /></td></tr>
          ) : null}
        </tbody>
      </table>
    </TableCard>
  );
}

/**
 * Required training the learner says is done, that nobody has confirmed.
 *
 * Progress is self-reported, which is fine as a personal tracker and worthless
 * as evidence. This is the queue that turns one into the other.
 */
async function VerificationReport({ db }: { db: any }) {
  const rows = await courseService.listAwaitingVerification(db);
  return <VerificationQueue rows={rows} />;
}

/**
 * Who could be rostered where, beyond their own department.
 *
 * Only verified, unexpired credentials appear: a self-declared certificate is a
 * claim, and an expired one used to be true. Either would put somebody on a
 * shift without the qualification the shift assumed.
 */
async function CoverageReport({ db, departmentId }: { db: any; departmentId?: string }) {
  const rows = await credentialService.coverage(db, departmentId);
  const byDepartment = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byDepartment.get(row.department_name) ?? [];
    list.push(row);
    byDepartment.set(row.department_name, list);
  }

  return (
    <TableCard title={`${byDepartment.size} ${byDepartment.size === 1 ? 'department has' : 'departments have'} cover from elsewhere`}>
      <table className="table">
        <thead>
          <tr><th>Department</th><th>Who</th><th>Normally in</th><th>On the strength of</th><th>Until</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.employee_id}-${r.credential_type_id}-${r.department_id}`}>
              <td style={{ fontWeight: 560 }}>{r.department_name}</td>
              <td>
                <Person name={r.employee_name} meta={r.job_title ?? undefined} href={`/employees/${r.employee_id}`} />
              </td>
              <td className="subtle">{r.home_department ?? '—'}</td>
              <td>
                {r.credential_name}
                {r.is_required ? <span className="badge" style={{ marginLeft: 6 }}>Required there</span> : null}
                {r.conditions ? <div className="subtle truncate" style={{ maxWidth: 260 }}>{r.conditions}</div> : null}
              </td>
              <td className="subtle nowrap">
                {r.expires_on ? formatDate(r.expires_on) : 'No expiry'}
                <ApprovedStamp at={r.verified_at} by={r.verified_by_name} />
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5}>
                <EmptyState message="Nobody holds a checked credential that opens up another department yet." />
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </TableCard>
  );
}

/**
 * What somebody has offered and nobody has checked.
 *
 * Until a credential is checked it counts for nothing, so a queue nobody works
 * through is the same as not collecting certificates at all.
 */
async function CredentialQueue({ db }: { db: any }) {
  const rows = await credentialService.awaitingCheck(db);
  return (
    <TableCard title={`${rows.length} waiting to be checked`}>
      <table className="table">
        <thead>
          <tr><th>Person</th><th>Credential</th><th>Reference</th><th>Expires</th><th /></tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td><Person name={c.employee?.name ?? '—'} meta={c.employee?.email} href={`/employees/${c.employee_id}`} /></td>
              <td>
                <span style={{ fontWeight: 560 }}>{c.title}</span>
                <div className="subtle">{[c.type?.name, c.issuer, c.jurisdiction].filter(Boolean).join(' · ') || 'Not categorised'}</div>
              </td>
              <td className="subtle">{c.reference_number ?? '—'}</td>
              <td className="subtle nowrap">{c.expires_on ? formatDate(c.expires_on) : 'No expiry'}</td>
              <td className="actions"><CredentialReview credential={c} /></td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr><td colSpan={5}><EmptyState message="Nothing is waiting to be checked." /></td></tr>
          ) : null}
        </tbody>
      </table>
    </TableCard>
  );
}

/** Credentials that have run out, or are about to. */
async function ExpiringReport({ db }: { db: any }) {
  const rows = await credentialService.expiring(db);
  const gone = rows.filter((r) => r.has_expired);

  return (
    <TableCard title={`${rows.length} expiring · ${gone.length} already lapsed`}>
      <table className="table">
        <thead>
          <tr><th>Employee</th><th>Credential</th><th>Department</th><th>Manager</th><th>Expires</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.credential_id}>
              <td><Person name={r.employee_name} meta={r.employee_email} href={`/employees/${r.employee_id}`} /></td>
              <td>
                {r.credential_name}
                {r.blocks_a_department ? (
                  <div className="subtle">Closes a department to them once it lapses.</div>
                ) : null}
              </td>
              <td className="subtle">{r.department_name ?? '—'}</td>
              <td className="subtle">{r.manager_name ?? '—'}</td>
              <td className="nowrap">
                <span className={`req req-${r.has_expired ? 'overdue' : r.days_left <= 30 ? 'due_soon' : 'upcoming'}`}>
                  {r.has_expired
                    ? `Lapsed ${formatDate(r.expires_on)}`
                    : `${r.days_left} ${r.days_left === 1 ? 'day' : 'days'} left`}
                </span>
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr><td colSpan={5}><EmptyState message="Nothing is close to expiring." /></td></tr>
          ) : null}
        </tbody>
      </table>
    </TableCard>
  );
}

/** Which documents are still owed, and by whom. */
async function DocumentRequestReport({ db, departmentId }: { db: any; departmentId?: string }) {
  const rows = await documentRequestService.outstanding(db, departmentId);
  const overdue = rows.filter((r) => r.is_overdue);

  return (
    <TableCard
      title={`${rows.length} outstanding · ${overdue.length} overdue`}
      action={
        <a className="btn btn-sm" href="/api/reports/document-requests" download>
          <Icon name="download" size={15} /> Export CSV
        </a>
      }
    >
      <table className="table">
        <thead>
          <tr><th>Employee</th><th>Document</th><th>Department</th><th>Manager</th><th>Due</th><th>Status</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.request_id}>
              <td><Person name={r.employee_name} meta={r.employee_email} href={`/employees/${r.employee_id}`} /></td>
              <td style={{ fontWeight: 560 }}>{r.title}</td>
              <td className="subtle">{r.department_name ?? '—'}</td>
              <td className="subtle">{r.manager_name ?? '—'}</td>
              <td className="nowrap">
                {r.due_date ? (
                  <span className={`req req-${r.is_overdue ? 'overdue' : 'due_soon'}`}>
                    {r.is_overdue ? `Overdue since ${formatDate(r.due_date)}` : `Due ${formatDate(r.due_date)}`}
                  </span>
                ) : <span className="subtle">No deadline</span>}
              </td>
              <td><StatusBadge status={r.status} /></td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr><td colSpan={6}><EmptyState message="Nothing outstanding. Every requested document is in." /></td></tr>
          ) : null}
        </tbody>
      </table>
    </TableCard>
  );
}

/** Who has not yet confirmed they have read a document that requires it. */
async function AcknowledgementReport({ db }: { db: any }) {
  const rows = await acknowledgementService.outstanding(db);
  const byDocument = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byDocument.get(row.document_name) ?? [];
    list.push(row);
    byDocument.set(row.document_name, list);
  }

  return (
    <TableCard
      title={`${rows.length} outstanding across ${byDocument.size} ${byDocument.size === 1 ? 'document' : 'documents'}`}
      action={
        <a className="btn btn-sm" href="/api/reports/acknowledgements" download>
          <Icon name="download" size={15} /> Export CSV
        </a>
      }
    >
      <table className="table">
        <thead>
          <tr><th>Document</th><th>Employee</th><th>Manager</th><th>Published</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.document_id}-${r.employee_id}`}>
              <td style={{ fontWeight: 560 }}>{r.document_name}</td>
              <td><Person name={r.employee_name} meta={r.employee_email} href={`/employees/${r.employee_id}`} /></td>
              <td className="subtle">{r.manager_name ?? '—'}</td>
              <td className="subtle nowrap">{formatDate(r.published_at)}</td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4}>
                <EmptyState message="Everyone has acknowledged every document that requires it." />
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </TableCard>
  );
}

async function CourseReport({ db }: { db: any }) {
  const performance = await analyticsService.listCoursePerformance(db);
  const totalAssigned = performance.reduce((s, c) => s + c.assigned, 0);
  const totalCompleted = performance.reduce((s, c) => s + c.completed, 0);

  return (
    <>
      <div className="grid grid-3">
        <StatCard label="Courses" value={performance.length} />
        <StatCard label="Assignments" value={totalAssigned} />
        <StatCard
          label="Completed"
          value={totalCompleted}
          hint={totalAssigned ? `${Math.round((totalCompleted / totalAssigned) * 100)}% of assignments` : undefined}
        />
      </div>
      <TableCard title="Course completion">
        <table className="table">
          <thead>
            <tr>
              <th>Course</th><th>Status</th><th className="num">Assigned</th><th className="num">Completed</th>
              <th className="num">In progress</th><th className="num">Pending</th><th>Average progress</th>
            </tr>
          </thead>
          <tbody>
            {performance.map((c) => (
              <tr key={c.course_id}>
                <td><Link className="link" href={`/courses/${c.course_id}`}>{c.title}</Link></td>
                <td><StatusBadge status={c.status} /></td>
                <td className="num">{c.assigned}</td>
                <td className="num">{c.completed}</td>
                <td className="num">{c.in_progress}</td>
                <td className="num">{c.pending}</td>
                <td><ProgressBar value={c.average_progress} /></td>
              </tr>
            ))}
            {performance.length === 0 ? <tr><td colSpan={7}><EmptyState message="No courses to report on yet." /></td></tr> : null}
          </tbody>
        </table>
      </TableCard>
    </>
  );
}

async function OnboardingReport({ db }: { db: any }) {
  const plans = await onboardingService.listOnboarding(db);
  const completed = plans.filter((p) => p.status === 'Completed').length;
  const overdue = plans.filter((p) => p.status === 'Overdue').length;
  const average = plans.length ? Math.round(plans.reduce((s, p) => s + p.progress, 0) / plans.length) : 0;

  return (
    <>
      <div className="grid grid-4">
        <StatCard label="Plans" value={plans.length} />
        <StatCard label="Completed" value={completed} />
        <StatCard label="Overdue" value={overdue} />
        <StatCard label="Average completion" value={`${average}%`} />
      </div>
      <TableCard title="Onboarding progress">
        <table className="table">
          <thead><tr><th>Employee</th><th>Template</th><th>Progress</th><th>Status</th><th>Target</th></tr></thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id}>
                <td><Person name={p.employee?.name ?? '—'} href={`/onboarding/${p.id}`} /></td>
                <td className="subtle">{p.template?.name ?? '—'}</td>
                <td><ProgressBar value={p.progress} /></td>
                <td><StatusBadge status={p.status} /></td>
                <td className="subtle nowrap">{formatDate(p.target_completion_date)}</td>
              </tr>
            ))}
            {plans.length === 0 ? <tr><td colSpan={5}><EmptyState message="No onboarding plans yet." /></td></tr> : null}
          </tbody>
        </table>
      </TableCard>
    </>
  );
}

async function TaskReport({ db, departmentId }: { db: any; departmentId?: string }) {
  const [tasks, employees] = await Promise.all([
    taskService.listTasks(db),
    employeeService.listEmployees(db, { departmentId: (departmentId as any) ?? 'All' }),
  ]);
  const ids = new Set(employees.map((e) => e.id));
  const scoped = departmentId ? tasks.filter((t) => t.assigned_to && ids.has(t.assigned_to)) : tasks;
  const outstanding = scoped.filter((t) => t.status !== 'Completed');
  const today = new Date().toISOString().slice(0, 10);
  const overdue = outstanding.filter((t) => t.due_date && t.due_date < today);

  return (
    <>
      <div className="grid grid-4">
        <StatCard label="Total tasks" value={scoped.length} />
        <StatCard label="Completed" value={scoped.length - outstanding.length} />
        <StatCard label="Outstanding" value={outstanding.length} />
        <StatCard label="Overdue" value={overdue.length} />
      </div>
      <TableCard title="Outstanding tasks">
        <table className="table">
          <thead><tr><th>Task</th><th>Responsible</th><th>Status</th><th>Priority</th><th>Due</th></tr></thead>
          <tbody>
            {outstanding.map((t) => (
              <tr key={t.id}>
                <td><Link className="link" href={`/tasks/${t.id}`}>{t.title}</Link></td>
                <td>{t.assignee ? <Person name={t.assignee.name} href={`/employees/${t.assigned_to}`} /> : <span className="subtle">Unassigned</span>}</td>
                <td><StatusBadge status={t.status} /></td>
                <td><StatusBadge status={t.priority} /></td>
                <td className="subtle nowrap">{formatDate(t.due_date)}</td>
              </tr>
            ))}
            {outstanding.length === 0 ? <tr><td colSpan={5}><EmptyState message="Nothing outstanding. Snoopy approves." /></td></tr> : null}
          </tbody>
        </table>
      </TableCard>
    </>
  );
}

async function EmployeeReport({ db, departmentId }: { db: any; departmentId?: string }) {
  const rows = await analyticsService.listEmployeeProgress(db, { departmentId: (departmentId as any) ?? 'All' });
  return (
    <TableCard title="Employee progress">
      <table className="table">
        <thead>
          <tr>
            <th>Employee</th><th className="num">Courses</th><th className="num">Completed</th>
            <th className="num">Tasks</th><th className="num">Overdue</th><th>Onboarding</th><th>Overall</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.employee_id}>
              <td><Person name={r.name} meta={r.job_title} href={`/employees/${r.employee_id}`} /></td>
              <td className="num">{r.total_courses}</td>
              <td className="num">{r.completed_courses}</td>
              <td className="num">{r.total_tasks}</td>
              <td className="num">{r.overdue_tasks}</td>
              <td><ProgressBar value={r.onboarding_progress} /></td>
              <td><ProgressBar value={r.overall_progress} /></td>
            </tr>
          ))}
          {rows.length === 0 ? <tr><td colSpan={7}><EmptyState message="No employees match this filter." /></td></tr> : null}
        </tbody>
      </table>
    </TableCard>
  );
}

async function EventReport({ db }: { db: any }) {
  const { eventService } = await import('@snoopy/shared');
  const events = await eventService.listEvents(db, {});
  return (
    <TableCard title="Events">
      <table className="table">
        <thead><tr><th>Event</th><th>Starts</th><th>Location</th><th className="num">Invited</th><th className="num">Going</th></tr></thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id}>
              <td><Link className="link" href={`/events/${e.id}`}>{e.title}</Link></td>
              <td className="subtle nowrap">{formatDateTime(e.start_time)}</td>
              <td className="subtle">{e.location ?? '—'}</td>
              <td className="num">{e.participants?.length ?? 0}</td>
              <td className="num">{(e.participants ?? []).filter((p) => p.response === 'Going').length}</td>
            </tr>
          ))}
          {events.length === 0 ? <tr><td colSpan={5}><EmptyState message="No events recorded." /></td></tr> : null}
        </tbody>
      </table>
    </TableCard>
  );
}

/**
 * Statements the employer owes, and has not handed over.
 *
 * Both are Fair Work Act obligations with a deadline attached — s.125 for the
 * Fair Work Information Statement, s.125B for the Casual Employment
 * Information Statement — and the second falls due again and again for as long
 * as somebody stays casual. Nothing in this report is entered by hand: every
 * row is derived from a start date and an employment basis, so a casual hired
 * this morning is already on it, and stays on it until somebody records that
 * the statement was given.
 */
async function StatementReport({ db }: { db: any }) {
  const rows = await statementService.listObligations(db);
  const outstanding = rows.filter((r) => r.status === 'Overdue');

  return (
    <TableCard title={`${outstanding.length} overdue · ${rows.length} in total`}>
      {rows.length === 0 ? (
        <EmptyState message="No statements are due. Add a start date to an employee record and they will appear here." />
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Employee</th><th>Statement</th><th>Due</th><th>Status</th><th>Given</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.employee_id}-${r.kind}-${r.due_on}`}>
                <td>
                  <Link href={`/employees/${r.employee_id}`}>{r.employee_name}</Link>
                  {r.manager_name ? <div className="subtle">Reports to {r.manager_name}</div> : null}
                </td>
                <td>{r.kind}</td>
                <td className={r.status === 'Overdue' ? 'warn' : undefined}>{formatDate(r.due_on)}</td>
                <td><StatusBadge status={r.status} /></td>
                <td>{r.issued_at ? formatDateTime(r.issued_at) : <span className="subtle">—</span>}</td>
                <td className="num">{r.issued_at ? null : <RecordStatement row={r} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </TableCard>
  );
}
