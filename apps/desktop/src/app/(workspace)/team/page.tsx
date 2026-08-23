import Link from 'next/link';
import { dueLabel, dueState, formatDate, teamService } from '@snoopy/shared';
import { EmptyState, PageHead, Person, ProgressBar, StatusBadge, TableCard } from '@/components/ui';
import { requireCapability } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * What a manager can see of their own team.
 *
 * Every row here is decided by the reporting-line policies in the database, not
 * by the queries on this page: a manager who asks for somebody else's team gets
 * an empty list rather than an error. Read-only by design — seeing that work is
 * late is a manager's job; reassigning it is not automatically theirs.
 */
export default async function TeamPage() {
  const session = await requireCapability('employee.view_team');
  const db = await getServerSupabase();

  const [reports, progress, training, tasks] = await Promise.all([
    teamService.listReports(db, session.userId),
    teamService.teamProgress(db, session.userId),
    teamService.teamRequiredTraining(db, session.userId),
    teamService.teamOpenTasks(db, session.userId),
  ]);

  if (reports.length === 0) {
    return (
      <>
        <PageHead title="My team" subtitle="The people who report to you." />
        <EmptyState message="Nobody reports to you yet. When they do, their work appears here." />
      </>
    );
  }

  const progressFor = new Map(progress.map((p) => [p.employee_id, p]));
  const overdue = training.filter((t) => dueState(t) === 'overdue');

  return (
    <>
      <PageHead
        title="My team"
        subtitle={
          overdue.length > 0
            ? `${overdue.length} required ${overdue.length === 1 ? 'course is' : 'courses are'} overdue across your team.`
            : `${reports.length} ${reports.length === 1 ? 'person reports' : 'people report'} to you.`
        }
      />

      <TableCard title="People">
        <table className="table">
          <thead>
            <tr><th>Person</th><th>Department</th><th>Overall progress</th><th className="num">Courses</th></tr>
          </thead>
          <tbody>
            {reports.map((r) => {
              const p = progressFor.get(r.id);
              return (
                <tr key={r.id}>
                  <td><Person name={r.name} meta={r.job_title ?? r.email} /></td>
                  <td className="subtle">{r.department?.name ?? '—'}</td>
                  <td><ProgressBar value={p?.overall_progress ?? 0} /></td>
                  <td className="num">{p?.completed_courses ?? 0}/{p?.total_courses ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableCard>


      <TableCard title="Required training outstanding">
        <table className="table">
          <thead><tr><th>Person</th><th>Course</th><th>Due</th><th>Progress</th></tr></thead>
          <tbody>
            {training.map((t) => {
              const state = dueState(t);
              return (
                <tr key={t.id}>
                  <td>{t.user?.name}</td>
                  <td><Link className="link" href={`/courses/${t.course_id}`}>{t.course?.title}</Link></td>
                  <td className="nowrap"><span className={`req req-${state}`}>{dueLabel(t, state)}</span></td>
                  <td><ProgressBar value={t.progress} /></td>
                </tr>
              );
            })}
            {training.length === 0 ? (
              <tr><td colSpan={4}><EmptyState message="Your team has no required training outstanding." /></td></tr>
            ) : null}
          </tbody>
        </table>
      </TableCard>


      <TableCard title="Open tasks">
        <table className="table">
          <thead><tr><th>Task</th><th>Person</th><th>Status</th><th>Due</th></tr></thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id}>
                <td>{t.title}</td>
                <td className="subtle">{(t as { assignee?: { name: string } }).assignee?.name ?? '—'}</td>
                <td><StatusBadge status={t.status} /></td>
                <td className="subtle nowrap">{formatDate(t.due_date)}</td>
              </tr>
            ))}
            {tasks.length === 0 ? (
              <tr><td colSpan={4}><EmptyState message="Nothing open across your team." /></td></tr>
            ) : null}
          </tbody>
        </table>
      </TableCard>
    </>
  );
}
