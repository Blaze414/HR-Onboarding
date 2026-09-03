import Link from 'next/link';
import { notFound } from 'next/navigation';
import { courseService, relativeDueLabel, employeeService, formatDate, taskService } from '@snoopy/shared';
import { ActionButton } from '@/components/Interactive';
import { TaskForm } from '@/components/TaskForm';
import { TaskStatusControl } from '@/components/TaskStatusControl';
import { Card, PageHead, Person, StatusBadge, Tabs } from '@/components/ui';
import { deleteTaskAction } from '@/lib/actions';
import { requireSession } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function TaskDetailPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab = 'overview' } = await searchParams;
  const session = await requireSession();
  const db = await getServerSupabase();
  const isAdmin = session.profile.role === 'admin';

  const task = await taskService.getTask(db, id);
  if (!task) notFound();

  const canUpdateStatus = isAdmin || task.assigned_to === session.userId;

  const [employees, courses] = isAdmin
    ? await Promise.all([
        employeeService.listEmployees(db, { activeOnly: true }),
        courseService.listCourses(db),
      ])
    : [[], []];

  return (
    <>
      <PageHead
        title={task.title}
        subtitle={task.description ?? undefined}
        actions={isAdmin ? (
          <ActionButton
            label="Delete task" icon="trash" variant="danger" small={false}
            confirm="Delete this task? This cannot be undone."
            action={deleteTaskAction.bind(null, id)}
          />
        ) : null}
      />

      {isAdmin ? (
        <Tabs
          tabs={[
            { href: `/tasks/${id}`, label: 'Overview' },
            { href: `/tasks/${id}?tab=edit`, label: 'Edit' },
          ]}
          current={tab === 'overview' ? `/tasks/${id}` : `/tasks/${id}?tab=edit`}
        />
      ) : null}

      {tab === 'edit' && isAdmin ? (
        <section className="card"><div className="card-body">
          <TaskForm task={task} employees={employees} courses={courses} />
        </div></section>
      ) : (
        <div className="grid grid-2">
          <Card title="Task details">
            <dl className="dl">
              <dt>Status</dt><dd><StatusBadge status={task.status} /></dd>
              <dt>Priority</dt><dd><StatusBadge status={task.priority} /></dd>
              <dt>Due</dt><dd>{formatDate(task.due_date)} · <span className="subtle">{relativeDueLabel(task.due_date, task.status === 'Completed')}</span></dd>
              <dt>Responsible</dt>
              <dd>{task.assignee ? <Person name={task.assignee.name} href={`/employees/${task.assigned_to}`} /> : <span className="subtle">Unassigned</span>}</dd>
              <dt>Related course</dt>
              <dd>{task.course ? <Link className="link" href={`/courses/${task.course_id}`}>{task.course.title}</Link> : '—'}</dd>
              <dt>Completed</dt><dd>{task.completed_at ? formatDate(task.completed_at) : '—'}</dd>
            </dl>
          </Card>

          <Card title="Update status">
            {canUpdateStatus ? (
              <TaskStatusControl taskId={task.id} status={task.status} />
            ) : (
              <p className="muted">Only the person responsible for this task can change its status.</p>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
