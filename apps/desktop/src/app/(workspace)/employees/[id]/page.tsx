import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  documentRequestService,
  analyticsService, authService, courseService, documentService, employeeService,
  EMPTY_STATES, formatDate, formatDateTime, formatRelativeDay, loadTimeline, onboardingService,
  roleService,
  taskService,
} from '@snoopy/shared';
import { EmployeeForm } from '@/components/EmployeeForm';
import { EmployeeDocuments } from '@/components/EmployeeDocuments';
import { Handover } from '@/components/Handover';
import { ActionButton } from '@/components/Interactive';
import { StartOnboarding } from '@/components/StartOnboarding';
import {
  Avatar, Card, EmptyState, PageHead, ProgressBar, StatCard, StatusBadge, Tabs, TableCard,
} from '@/components/ui';
import { setEmployeeActiveAction } from '@/lib/actions';
import { requireAdmin, sessionCan } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const TAB_KEYS = ['overview', 'courses', 'tasks', 'onboarding', 'documents', 'history', 'edit'] as const;

export default async function EmployeeDetailPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab = 'overview' } = await searchParams;
  const session = await requireAdmin();
  const db = await getServerSupabase();

  const employee = await employeeService.getEmployee(db, id);
  const canRequestDocuments = sessionCan(session, 'document.request');

  // The paperwork side of this person's record, loaded only for people who can
  // act on it.
  const [documentRequests, checklists, sharedDocuments] = canRequestDocuments
    ? await Promise.all([
        documentRequestService.forEmployee(db, id),
        documentRequestService.listChecklists(db),
        db.from('documents').select('id,name').is('owner_id', null).order('name')
          .then((r) => (r.data ?? []) as { id: string; name: string }[]),
      ])
    : [[], [], []];

  // Who could pick this person's work up: anyone still here but them.
  const colleagues = (await employeeService.listEmployees(db, { activeOnly: true }))
    .filter((c) => c.id !== id)
    .map((c) => ({ id: c.id, name: c.name }));
  if (!employee) notFound();

  const progress = await analyticsService.getEmployeeProgress(db, id);
  // Read through this admin's own session, so the row policy — the person and
  // HR, nobody else — is what decides whether it appears.
  const emergencyContact = await authService.loadEmergencyContact(db, id);
  const current = tab === 'overview' ? `/employees/${id}` : `/employees/${id}?tab=${tab}`;

  return (
    <>
      <PageHead
        title={employee.name}
        subtitle={`${employee.job_title ?? 'Employee'}${employee.department?.name ? ` · ${employee.department.name}` : ''}`}
        actions={
          <ActionButton
            label={employee.is_active ? 'Deactivate' : 'Reactivate'}
            small={false}
            variant={employee.is_active ? 'danger' : ''}
            confirm={employee.is_active ? 'Deactivate this employee? They stay in reports but drop out of active counts.' : undefined}
            action={setEmployeeActiveAction.bind(null, id, !employee.is_active)}
          />
        }
      />

      <Handover
        employeeId={id}
        employeeName={employee.name}
        isActive={employee.is_active}
        candidates={colleagues}
        db={db}
        canOffboard={sessionCan(session, 'employee.offboard')}
      />

      {canRequestDocuments ? (
        <EmployeeDocuments
          employeeId={id}
          employeeName={employee.name}
          requests={documentRequests}
          checklists={checklists.map((c: { id: string; name: string; kind: string }) => ({
            id: c.id, name: c.name, kind: c.kind,
          }))}
          sharedDocuments={sharedDocuments}
        />
      ) : null}

      <Tabs
        tabs={TAB_KEYS.map((k) => ({
          href: k === 'overview' ? `/employees/${id}` : `/employees/${id}?tab=${k}`,
          label: k[0].toUpperCase() + k.slice(1),
        }))}
        current={current}
      />

      {tab === 'overview' ? <Overview employee={employee} progress={progress} emergencyContact={emergencyContact} /> : null}
      {tab === 'courses' ? <CoursesTab db={db} id={id} /> : null}
      {tab === 'tasks' ? <TasksTab db={db} id={id} /> : null}
      {tab === 'onboarding' ? <OnboardingTab db={db} id={id} /> : null}
      {tab === 'documents' ? <DocumentsTab db={db} id={id} /> : null}
      {tab === 'history' ? <HistoryTab db={db} id={id} /> : null}
      {tab === 'edit' ? <EditTab db={db} employee={employee} /> : null}
    </>
  );
}

function Overview({ employee, progress, emergencyContact }: { employee: any; progress: any; emergencyContact: any }) {
  return (
    <>
      <div className="grid grid-4" style={{ marginBottom: 18 }}>
        <StatCard label="Overall progress" value={progress?.overall_progress != null ? `${progress.overall_progress}%` : '—'} hint="50% courses · 25% tasks · 25% onboarding" />
        <StatCard label="Courses" value={progress?.total_courses ?? 0} hint={`${progress?.completed_courses ?? 0} completed`} />
        <StatCard label="Tasks" value={progress?.total_tasks ?? 0} hint={`${progress?.overdue_tasks ?? 0} overdue`} />
        <StatCard label="Onboarding" value={progress?.onboarding_progress != null ? `${progress.onboarding_progress}%` : '—'} hint={progress?.onboarding_status ?? 'No plan'} />
      </div>

      <div className="grid grid-2">
        <Card title="Profile">
          <div className="row" style={{ marginBottom: 16 }}>
            <Avatar name={employee.name} large />
            <div>
              <div style={{ fontWeight: 600 }}>{employee.name}</div>
              <div className="subtle">{employee.email}</div>
            </div>
          </div>
          <dl className="dl">
            <dt>Department</dt><dd>{employee.department?.name ?? '—'}</dd>
            <dt>Job title</dt><dd>{employee.job_title ?? '—'}</dd>
            <dt>Manager</dt><dd>{employee.manager?.name ?? '—'}</dd>
            <dt>Role</dt><dd><StatusBadge status={employee.role} /></dd>
            <dt>Start date</dt><dd>{formatDate(employee.start_date)}</dd>
            {/* Required particulars of an employee record — Fair Work
                Regulations 2009 reg 3.32. Shown as one line because they are
                one fact: what kind of employment this is. */}
            <dt>Employment</dt>
            <dd>
              {employee.employment_hours && employee.employment_basis
                ? employee.employment_hours === 'Casual'
                  ? 'Casual'
                  : `${employee.employment_hours} · ${employee.employment_basis}`
                : <span className="warn">Not recorded — required on an employee record.</span>}
            </dd>
            {employee.end_date ? <><dt>End date</dt><dd>{formatDate(employee.end_date)}</dd></> : null}
            <dt>Phone</dt><dd>{employee.phone ?? '—'}</dd>
            {/* Kept by the person, not by HR. Shown here because this is the
                screen somebody opens when they need it in a hurry. */}
            <dt>In an emergency</dt>
            <dd>
              {emergencyContact
                ? `${emergencyContact.name}${emergencyContact.relationship ? ` (${emergencyContact.relationship})` : ''} · ${emergencyContact.phone}`
                : 'Not recorded — ask them to add one from their profile.'}
            </dd>
          </dl>
        </Card>

        <Card title="Progress breakdown">
          <div className="stack">
            <Row label="Course progress" value={progress?.course_progress ?? null} />
            <Row label="Task completion" value={progress?.task_progress ?? null} />
            <Row label="Onboarding" value={progress?.onboarding_progress ?? null} />
          </div>
        </Card>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="row-between">
      <span className="muted" style={{ minWidth: 140 }}>{label}</span>
      <div style={{ flex: 1 }}><ProgressBar value={value} /></div>
    </div>
  );
}

async function CoursesTab({ db, id }: { db: any; id: string }) {
  const assignments = await courseService.listMyAssignments(db, id);
  return (
    <TableCard title="Assigned courses">
      <table className="table">
        <thead><tr><th>Course</th><th>Status</th><th>Progress</th><th>Completed</th></tr></thead>
        <tbody>
          {assignments.map((a) => (
            <tr key={a.id}>
              <td><Link className="link" href={`/courses/${a.course_id}`}>{a.course?.title}</Link></td>
              <td><StatusBadge status={a.status} /></td>
              <td><ProgressBar value={a.progress} /></td>
              <td className="subtle nowrap">{a.completed_at ? formatDate(a.completed_at) : '—'}</td>
            </tr>
          ))}
          {assignments.length === 0 ? (
            <tr><td colSpan={4}><EmptyState message="No courses assigned yet." /></td></tr>
          ) : null}
        </tbody>
      </table>
    </TableCard>
  );
}

async function TasksTab({ db, id }: { db: any; id: string }) {
  const tasks = await taskService.listTasks(db, { assignedTo: id });
  return (
    <TableCard title="Assigned tasks">
      <table className="table">
        <thead><tr><th>Task</th><th>Status</th><th>Priority</th><th>Due</th></tr></thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id}>
              <td><Link className="link" href={`/tasks/${t.id}`}>{t.title}</Link></td>
              <td><StatusBadge status={t.status} /></td>
              <td><StatusBadge status={t.priority} /></td>
              <td className="subtle nowrap">{formatRelativeDay(t.due_date)}</td>
            </tr>
          ))}
          {tasks.length === 0 ? <tr><td colSpan={4}><EmptyState message={EMPTY_STATES.tasks} /></td></tr> : null}
        </tbody>
      </table>
    </TableCard>
  );
}

async function OnboardingTab({ db, id }: { db: any; id: string }) {
  const [plan, templates, employees] = await Promise.all([
    onboardingService.getMyOnboarding(db, id),
    onboardingService.listTemplates(db),
    employeeService.listEmployees(db, { activeOnly: true }),
  ]);

  if (!plan) {
    return (
      <Card title="Onboarding" action={<StartOnboarding employees={employees} templates={templates} presetEmployeeId={id} />}>
        <EmptyState message="No onboarding plan has been started for this employee." />
      </Card>
    );
  }

  return (
    <Card
      title={plan.template?.name ?? 'Onboarding'}
      action={<Link className="btn btn-sm" href={`/onboarding/${plan.id}`}>Open plan</Link>}
    >
      <div className="stack">
        <ProgressBar value={plan.progress} />
        <div className="row"><StatusBadge status={plan.status} /></div>
        <div className="step-list">
          {(plan.steps ?? []).map((s) => (
            <div key={s.id} className={`step${s.status === 'Completed' ? ' done' : ''}`}>
              <span className="order">{s.sort_order}</span>
              <span className="title">{s.title}</span>
              <StatusBadge status={s.status} />
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

async function DocumentsTab({ db, id }: { db: any; id: string }) {
  const documents = await documentService.listDocuments(db, id, { ownerId: id });
  return (
    <TableCard title="Documents">
      <table className="table">
        <thead><tr><th>Name</th><th>Category</th><th>Added</th></tr></thead>
        <tbody>
          {documents.map((d) => (
            <tr key={d.id}>
              <td>{d.name}</td>
              <td><StatusBadge status={d.category} /></td>
              <td className="subtle nowrap">{formatDate(d.created_at)}</td>
            </tr>
          ))}
          {documents.length === 0 ? <tr><td colSpan={3}><EmptyState message={EMPTY_STATES.documents} /></td></tr> : null}
        </tbody>
      </table>
    </TableCard>
  );
}

/**
 * Everything that happened to this person, in the order it happened.
 *
 * This tab used to show the activity log — what this person *did*, which is the
 * smaller half of a record and rarely the half anybody comes here for. The
 * questions people actually arrive with are "what happened with her" and "who
 * accepted that, and when", and answering either meant reading five other tabs
 * and holding the dates in your head.
 */
async function HistoryTab({ db, id }: { db: any; id: string }) {
  const entries = await loadTimeline(db, id);
  if (entries.length === 0) return <Card title="History"><EmptyState message={EMPTY_STATES.activity} /></Card>;

  return (
    <Card title="History">
      <ol className="timeline">
        {entries.map((entry) => (
          <li key={entry.id} className={`timeline-item timeline-${entry.kind}`}>
            <div className="timeline-when subtle nowrap">{formatDateTime(entry.at)}</div>
            <div>
              <div style={{ fontWeight: 560 }}>
                {entry.href ? <Link className="link" href={entry.href}>{entry.title}</Link> : entry.title}
              </div>
              {entry.detail ? <div className="subtle">{entry.detail}</div> : null}
              {/* Named only when somebody else did it — "by Charlie Brown" on
                  every row of a person's own record is noise. */}
              {entry.actor ? <div className="subtle">by {entry.actor}</div> : null}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

async function EditTab({ db, employee }: { db: any; employee: any }) {
  const [departments, managers, roles] = await Promise.all([
    employeeService.listDepartments(db),
    employeeService.listEmployees(db, { activeOnly: true }),
    roleService.listRoles(db),
  ]);
  return (
    <section className="card"><div className="card-body">
      <EmployeeForm employee={employee} departments={departments} managers={managers} roles={roles} />
    </div></section>
  );
}
