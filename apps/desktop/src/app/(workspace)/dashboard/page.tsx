import Link from 'next/link';
import {
  credentialService,
  notificationService,
  activityService, analyticsService, dashboardService, EMPTY_STATES,
  relativeDueLabel, formatDateTime, formatRelativeDay, greeting, firstName,
} from '@snoopy/shared';
import {
  BarChart, Card, EmptyState, PageHead, Person, ProgressBar, StatCard, StatusBadge, TableCard,
} from '@/components/ui';
import { requireSession, sessionCan } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: { searchParams: Promise<{ denied?: string }> }) {
  const { denied } = await searchParams;
  const session = await requireSession();
  const db = await getServerSupabase();
  // Reminders are raised when someone looks, rather than only when a scheduler
  // runs. The sweep is idempotent, so this costs one cheap query and means a
  // deployment with no cron still chases overdue training.
  await notificationService.sweepDeadlines(db).catch(() => 0);
  // A certificate that lapsed yesterday keeps its Verified stamp until somebody
  // says otherwise, and the roster is the worst place to find that out.
  await credentialService.sweepExpired(db).catch(() => 0);
  const hello = `${greeting()}, ${firstName(session.profile.name)}`;

  if (session.profile.role === 'admin') {
    const [counts, org, departments, employeeProgress, coursePerf, activity, plans, orgRow] = await Promise.all([
      dashboardService.loadAdminCounts(db),
      analyticsService.getOrganisationProgress(db),
      analyticsService.listDepartmentProgress(db),
      analyticsService.listEmployeeProgress(db),
      analyticsService.listCoursePerformance(db),
      activityService.listActivity(db, 8),
      db.from('employee_onboarding')
        .select('*, employee:profiles!employee_onboarding_employee_id_fkey(id,name)')
        .neq('status', 'Completed').order('target_completion_date'),
      // Same lookup settings/page.tsx already does. An admin landing here has
      // no other cue which organisation they're inside — this is the one
      // screen everybody hits first, so it's the one place that matters most.
      db.from('organisations').select('name').eq('id', session.organisationId).maybeSingle(),
    ]);

    const attention = analyticsService.deriveAttention(employeeProgress).slice(0, 5);

    return (
      <>
        {denied ? (
          <div className="alert" role="alert">
            You do not have permission to open that page.
          </div>
        ) : null}

        <PageHead title={hello} subtitle={orgRow.data?.name ? `${orgRow.data.name} · Organisation overview` : 'Organisation overview'} />

        <div className="grid grid-4">
          <StatCard label="Employees" value={counts.employees} href="/employees" icon="employees" tone="accent" />
          <StatCard label="Courses" value={counts.courses} href="/courses" icon="course" tone="info" />
          <StatCard label="Open tasks" value={counts.openTasks} href="/tasks" icon="task" tone="warn" />
          <StatCard label="Active onboarding" value={counts.activeOnboarding} href="/onboarding" icon="onboarding" tone="ok" />
        </div>

        <div className="grid grid-2">
          <Card title="Organisation progress">
            {org ? (
              <div className="stack">
                <Metric label="Overall" value={org.overall_progress} />
                <Metric label="Course completion" value={org.course_progress} />
                <Metric label="Task completion" value={org.task_progress} />
                <Metric label="Onboarding" value={org.onboarding_progress} />
                <p className="subtle">
                  {org.employees} active employees · {org.overdue_tasks} overdue tasks
                </p>
              </div>
            ) : (
              <EmptyState message="No progress data yet." />
            )}
          </Card>

          <Card title="Department performance" action={<Link className="btn btn-sm" href="/analytics">Open analytics</Link>}>
            <BarChart
              rows={departments
                .filter((d) => d.employees > 0)
                .map((d) => ({ label: d.name, value: d.overall_progress, href: `/departments/${d.department_id}` }))}
            />
          </Card>
        </div>

        <div className="grid grid-2">
          <Card title="Needs attention">
            {attention.length === 0 ? (
              <EmptyState message="Everyone is tracking well right now." />
            ) : (
              <div className="stack">
                {attention.map((item) => (
                  <div key={item.employee_id} className="row-between">
                    <Link className="link" href={`/employees/${item.employee_id}`}>{item.name}</Link>
                    <span className="subtle">{item.reason}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Course completion">
            <BarChart
              rows={coursePerf.slice(0, 6).map((c) => ({
                label: c.title, value: c.average_progress, href: `/courses/${c.course_id}`,
              }))}
            />
          </Card>
        </div>

        <div className="grid grid-2">
          <TableCard title="Onboarding in progress">
            <table className="table">
              <thead>
                <tr><th>Employee</th><th>Progress</th><th>Status</th><th>Target</th></tr>
              </thead>
              <tbody>
                {(plans.data ?? []).slice(0, 6).map((p: any) => (
                  <tr key={p.id}>
                    <td><Link className="link" href={`/onboarding/${p.id}`}>{p.employee?.name}</Link></td>
                    <td><ProgressBar value={p.progress} /></td>
                    <td><StatusBadge status={p.status} /></td>
                    <td className="subtle">{formatRelativeDay(p.target_completion_date)}</td>
                  </tr>
                ))}
                {(plans.data ?? []).length === 0 ? (
                  <tr><td colSpan={4}><EmptyState message="No active onboarding plans." /></td></tr>
                ) : null}
              </tbody>
            </table>
          </TableCard>

          <Card title="Recent activity" action={<Link className="btn btn-sm" href="/activity">View all</Link>}>
            {activity.length === 0 ? (
              <EmptyState message={EMPTY_STATES.activity} />
            ) : (
              <div className="stack">
                {activity.map((entry) => (
                  <div key={entry.id} className="row-between">
                    <span>{activityService.describeActivity(entry)}</span>
                    <span className="subtle nowrap">{formatDateTime(entry.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </>
    );
  }

  // ------------------------------------------------------------- employee
  const data = await dashboardService.loadEmployeeDashboard(db, session.userId);
  const todaysTasks = data.tasks.filter((t) => t.status !== 'Completed').slice(0, 6);

  return (
    <>
      {denied ? (
        <div className="alert" role="alert">You do not have permission to open that page.</div>
      ) : null}

      <PageHead title={hello} subtitle="Here is where your work stands today." />

      {/*
        * The figures across the top are a summary of this person's own work —
        * counts and percentages rather than the underlying records. That is what
        * `report.view_summary` grants, so a role without it still reaches the
        * lists below, just not the roll-up.
        */}
      {sessionCan(session, 'report.view_summary') ? (
        <div className="grid grid-4">
          <StatCard label="Courses" value={data.totalCourses} hint={`${data.completedCourses} completed`} href="/courses" icon="course" tone="info" />
          <StatCard label="Outstanding tasks" value={data.outstandingTasks} hint={`${data.overdueTasks} overdue`} href="/tasks" icon="task" tone="warn" />
          <StatCard label="Upcoming events" value={data.upcomingEvents.length} href="/events" icon="event" tone="accent" />
          <StatCard
            label="Onboarding"
            value={data.onboarding ? `${data.onboarding.progress}%` : '—'}
            hint={data.onboarding?.status ?? 'No plan assigned'}
            href="/onboarding"
            icon="onboarding"
            tone="ok"
          />
        </div>
      ) : null}

      <div className="grid grid-2">
        <TableCard title="My courses">
          <table className="table">
            <thead><tr><th>Course</th><th>Status</th><th>Progress</th></tr></thead>
            <tbody>
              {data.assignments.map((a) => (
                <tr key={a.id}>
                  <td><Link className="link" href={`/courses/${a.course_id}`}>{a.course?.title}</Link></td>
                  <td><StatusBadge status={a.status} /></td>
                  <td><ProgressBar value={a.progress} /></td>
                </tr>
              ))}
              {data.assignments.length === 0 ? (
                <tr><td colSpan={3}><EmptyState message={EMPTY_STATES.courses} /></td></tr>
              ) : null}
            </tbody>
          </table>
        </TableCard>

        <TableCard title="Today's tasks">
          <table className="table">
            <thead><tr><th>Task</th><th>Priority</th><th>Due</th></tr></thead>
            <tbody>
              {todaysTasks.map((t) => (
                <tr key={t.id}>
                  <td><Link className="link" href={`/tasks/${t.id}`}>{t.title}</Link></td>
                  <td><StatusBadge status={t.priority} /></td>
                  <td className="subtle nowrap">{formatRelativeDay(t.due_date)}</td>
                </tr>
              ))}
              {todaysTasks.length === 0 ? (
                <tr><td colSpan={3}><EmptyState message={EMPTY_STATES.tasks} /></td></tr>
              ) : null}
            </tbody>
          </table>
        </TableCard>
      </div>

      <div className="grid grid-2">
        <Card title="Upcoming events">
          {data.upcomingEvents.length === 0 ? (
            <EmptyState message={EMPTY_STATES.events} />
          ) : (
            <div className="stack">
              {data.upcomingEvents.map((e) => (
                <div key={e.id} className="row-between">
                  <Link className="link" href={`/events/${e.id}`}>{e.title}</Link>
                  <span className="subtle nowrap">{formatDateTime(e.start_time)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="My onboarding" action={<Link className="btn btn-sm" href="/onboarding">Open</Link>}>
          {data.onboarding ? (
            <div className="stack">
              <ProgressBar value={data.onboarding.progress} />
              <p className="subtle">
                {data.onboarding.status} · target {relativeDueLabel(data.onboarding.target_completion_date, data.onboarding.status === 'Completed')}
              </p>
            </div>
          ) : (
            <EmptyState message="No onboarding plan is assigned to you." />
          )}
        </Card>
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="row-between">
      <span className="muted" style={{ minWidth: 150 }}>{label}</span>
      <div style={{ flex: 1 }}><ProgressBar value={value} /></div>
    </div>
  );
}
