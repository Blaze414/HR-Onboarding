import Link from 'next/link';
import {
  courseService, relativeDueLabel, employeeService, EMPTY_STATES,
  TASK_PRIORITIES, TASK_STATUSES, taskService,
} from '@snoopy/shared';
import { ClearFilters, SearchInput, SelectFilter } from '@/components/Filters';
import { Icon } from '@/components/Icon';
import { EmptyState, PageHead, Person, StatusBadge, TableCard } from '@/components/ui';
import { requireCapability, sessionCan } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function TasksPage({
  searchParams,
}: { searchParams: Promise<{ q?: string; status?: string; priority?: string; assignee?: string }> }) {
  const { q, status, priority, assignee } = await searchParams;
  const session = await requireCapability('task.view');
  const db = await getServerSupabase();
  const isAdmin = session.profile.role === 'admin';

  const [tasks, employees] = await Promise.all([
    taskService.listTasks(db, {
      search: q,
      status: (status as any) ?? 'All',
      priority: (priority as any) ?? 'All',
      // Employees only ever see their own work; RLS enforces the same thing.
      assignedTo: isAdmin ? (assignee || undefined) : session.userId,
    }),
    isAdmin ? employeeService.listEmployees(db, { activeOnly: true }) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHead
        title={isAdmin ? 'Tasks' : 'My tasks'}
        subtitle={isAdmin
          ? 'Assign work, track what is outstanding and follow up on overdue items.'
          : 'Everything assigned to you, soonest first.'}
        actions={sessionCan(session, 'task.create') ? (
          <Link className="btn btn-primary" href="/tasks/new"><Icon name="plus" size={16} /> New task</Link>
        ) : null}
      />

      <div className="toolbar">
        <SearchInput placeholder="Search tasks…" />
        <SelectFilter name="status" label="Status" allLabel="Any status"
          options={TASK_STATUSES.map((s) => ({ value: s, label: s }))} />
        <SelectFilter name="priority" label="Priority" allLabel="Any priority"
          options={TASK_PRIORITIES.map((p) => ({ value: p, label: p }))} />
        {isAdmin ? (
          <SelectFilter name="assignee" label="Assignee" allLabel="Anyone"
            options={employees.map((e) => ({ value: e.id, label: e.name }))} />
        ) : null}
        <ClearFilters />
      </div>

      <TableCard>
        <table className="table">
          <thead>
            <tr>
              <th>Task</th>{isAdmin ? <th>Responsible</th> : null}
              <th>Status</th><th>Priority</th><th>Due</th><th>Course</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id}>
                <td><Link className="link" href={`/tasks/${t.id}`}>{t.title}</Link></td>
                {isAdmin ? (
                  <td>{t.assignee ? <Person name={t.assignee.name} href={`/employees/${t.assigned_to}`} /> : <span className="subtle">Unassigned</span>}</td>
                ) : null}
                <td><StatusBadge status={t.status} /></td>
                <td><StatusBadge status={t.priority} /></td>
                <td className="subtle nowrap">{relativeDueLabel(t.due_date, t.status === 'Completed')}</td>
                <td className="subtle">{t.course?.title ?? '—'}</td>
              </tr>
            ))}
            {tasks.length === 0 ? (
              <tr><td colSpan={isAdmin ? 6 : 5}><EmptyState message={EMPTY_STATES.tasks} /></td></tr>
            ) : null}
          </tbody>
        </table>
      </TableCard>
    </>
  );
}
