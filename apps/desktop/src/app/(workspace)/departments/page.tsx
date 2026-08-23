import Link from 'next/link';
import { analyticsService, employeeService } from '@snoopy/shared';
import { DepartmentEditor } from '@/components/DepartmentEditor';
import { EmptyState, PageHead, ProgressBar, TableCard } from '@/components/ui';
import { requireCapability } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function DepartmentsPage() {
  await requireCapability('department.view');
  const db = await getServerSupabase();
  const [departments, progress, employees] = await Promise.all([
    employeeService.listDepartments(db),
    analyticsService.listDepartmentProgress(db),
    employeeService.listEmployees(db, { activeOnly: true }),
  ]);
  const byId = new Map(progress.map((p) => [p.department_id, p]));

  return (
    <>
      <PageHead
        title="Departments"
        subtitle="Compare how each part of the organisation is progressing."
        actions={<DepartmentEditor managers={employees} />}
      />

      <TableCard>
        <table className="table">
          <thead>
            <tr>
              <th>Department</th><th className="num">Employees</th><th>Overall</th>
              <th>Courses</th><th>Tasks</th><th>Onboarding</th><th className="num">Overdue tasks</th>
            </tr>
          </thead>
          <tbody>
            {departments.map((d) => {
              const p = byId.get(d.id);
              return (
                <tr key={d.id}>
                  <td>
                    <Link className="link" href={`/departments/${d.id}`}>{d.name}</Link>
                    {d.description ? <div className="subtle truncate" style={{ maxWidth: 300 }}>{d.description}</div> : null}
                  </td>
                  <td className="num">{p?.employees ?? 0}</td>
                  <td><ProgressBar value={p?.overall_progress ?? 0} /></td>
                  <td><ProgressBar value={p?.course_progress ?? 0} /></td>
                  <td><ProgressBar value={p?.task_progress ?? 0} /></td>
                  <td><ProgressBar value={p?.onboarding_progress ?? 0} /></td>
                  <td className="num">{p?.overdue_tasks ?? 0}</td>
                </tr>
              );
            })}
            {departments.length === 0 ? (
              <tr><td colSpan={7}><EmptyState title="No departments yet" message="Add a department to group employees and compare progress." /></td></tr>
            ) : null}
          </tbody>
        </table>
      </TableCard>
    </>
  );
}
