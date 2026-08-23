import Link from 'next/link';
import { notFound } from 'next/navigation';
import { analyticsService, employeeService, taskService } from '@snoopy/shared';
import { DepartmentEditor } from '@/components/DepartmentEditor';
import {
  BarChart, Card, EmptyState, PageHead, Person, ProgressBar, StatCard, StatusBadge, TableCard,
} from '@/components/ui';
import { requireAdmin } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function DepartmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin();
  const db = await getServerSupabase();

  const [departments, progress, members, allEmployees] = await Promise.all([
    employeeService.listDepartments(db),
    analyticsService.getDepartmentProgress(db, id),
    analyticsService.listEmployeeProgress(db, { departmentId: id }),
    employeeService.listEmployees(db, { activeOnly: true }),
  ]);
  const department = departments.find((d) => d.id === id);
  if (!department) notFound();

  const manager = allEmployees.find((e) => e.id === department.manager_id);
  const memberIds = new Set(members.map((m) => m.employee_id));
  const tasks = (await taskService.listTasks(db)).filter((t) => t.assigned_to && memberIds.has(t.assigned_to));
  const outstanding = tasks.filter((t) => t.status !== 'Completed');

  return (
    <>
      <PageHead
        title={department.name}
        subtitle={department.description ?? undefined}
        actions={<DepartmentEditor department={department} managers={allEmployees} />}
      />

      <div className="grid grid-4" style={{ marginBottom: 18 }}>
        <StatCard label="Employees" value={progress?.employees ?? 0} hint={manager ? `Led by ${manager.name}` : 'No manager set'} />
        <StatCard label="Overall progress" value={`${progress?.overall_progress ?? 0}%`} />
        <StatCard label="Course completion" value={`${progress?.course_progress ?? 0}%`} />
        <StatCard label="Outstanding tasks" value={outstanding.length} hint={`${progress?.overdue_tasks ?? 0} overdue`} />
      </div>

      <div className="grid grid-2" style={{ marginBottom: 18 }}>
        <Card title="Progress by employee">
          <BarChart
            rows={members.map((m) => ({
              label: m.name, value: m.overall_progress ?? 0, href: `/employees/${m.employee_id}`,
            }))}
          />
        </Card>

        <Card title="Department breakdown">
          <div className="stack">
            <Metric label="Course progress" value={progress?.course_progress ?? 0} />
            <Metric label="Task completion" value={progress?.task_progress ?? 0} />
            <Metric label="Onboarding" value={progress?.onboarding_progress ?? 0} />
          </div>
        </Card>
      </div>

      <TableCard title="Employees">
        <table className="table">
          <thead>
            <tr><th>Employee</th><th>Overall</th><th>Courses</th><th>Tasks</th><th>Onboarding</th></tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.employee_id}>
                <td><Person name={m.name} meta={m.job_title} href={`/employees/${m.employee_id}`} /></td>
                <td><ProgressBar value={m.overall_progress} /></td>
                <td><ProgressBar value={m.course_progress} /></td>
                <td><ProgressBar value={m.task_progress} /></td>
                <td>{m.onboarding_status ? <StatusBadge status={m.onboarding_status} /> : <span className="subtle">—</span>}</td>
              </tr>
            ))}
            {members.length === 0 ? (
              <tr><td colSpan={5}><EmptyState message="Nobody is assigned to this department yet." /></td></tr>
            ) : null}
          </tbody>
        </table>
      </TableCard>
    </>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="row-between">
      <span className="muted" style={{ minWidth: 140 }}>{label}</span>
      <div style={{ flex: 1 }}><ProgressBar value={value} /></div>
    </div>
  );
}
