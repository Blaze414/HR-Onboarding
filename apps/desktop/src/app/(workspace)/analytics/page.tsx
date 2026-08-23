import Link from 'next/link';
import { analyticsService, employeeService } from '@snoopy/shared';
import { ClearFilters, SelectFilter } from '@/components/Filters';
import {
  BarChart, Card, EmptyState, PageHead, Person, ProgressBar, StatCard, StatusBadge, TableCard,
} from '@/components/ui';
import { requireCapability } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage({
  searchParams,
}: { searchParams: Promise<{ department?: string; min?: string }> }) {
  const { department, min } = await searchParams;
  await requireCapability('analytics.view_full');
  const db = await getServerSupabase();

  const [org, departments, deptList, employees, coursePerf] = await Promise.all([
    analyticsService.getOrganisationProgress(db),
    analyticsService.listDepartmentProgress(db),
    employeeService.listDepartments(db),
    analyticsService.listEmployeeProgress(db, {
      departmentId: (department as any) ?? 'All',
      maxProgress: min ? Number(min) : undefined,
    }),
    analyticsService.listCoursePerformance(db),
  ]);

  const attention = analyticsService.deriveAttention(employees);
  const deptAttention = analyticsService.deriveDepartmentAttention(departments);

  return (
    <>
      <PageHead
        title="Analytics"
        subtitle="Live progress across the organisation, its departments and its people. Every figure is calculated from records, not stored."
      />

      <div className="toolbar">
        <SelectFilter name="department" label="Department" allLabel="All departments"
          options={deptList.map((d) => ({ value: d.id, label: d.name }))} />
        <SelectFilter name="min" label="Progress" allLabel="Any progress"
          options={[
            { value: '40', label: 'Below 40%' },
            { value: '60', label: 'Below 60%' },
            { value: '80', label: 'Below 80%' },
          ]} />
        <ClearFilters />
      </div>

      <div className="grid grid-4">
        <StatCard label="Active employees" value={org?.employees ?? 0} />
        <StatCard label="Overall progress" value={`${org?.overall_progress ?? 0}%`} hint="Employee-weighted average" />
        <StatCard label="Course completion" value={`${org?.course_progress ?? 0}%`} />
        <StatCard label="Overdue tasks" value={org?.overdue_tasks ?? 0} />
      </div>

      <div className="grid grid-2">
        <Card title="Department comparison">
          <BarChart rows={departments.filter((d) => d.employees > 0).map((d) => ({
            label: d.name, value: d.overall_progress, href: `/departments/${d.department_id}`,
          }))} />
        </Card>
        <Card title="Course completion">
          <BarChart rows={coursePerf.map((c) => ({
            label: c.title, value: c.average_progress, href: `/courses/${c.course_id}`,
          }))} />
        </Card>
      </div>

      <TableCard title="Department performance">
        <table className="table">
          <thead>
            <tr>
              <th>Department</th><th className="num">Employees</th><th>Courses</th>
              <th>Tasks</th><th>Onboarding</th><th>Overall</th><th className="num">Overdue</th>
            </tr>
          </thead>
          <tbody>
            {departments.filter((d) => d.employees > 0).map((d) => (
              <tr key={d.department_id}>
                <td><Link className="link" href={`/departments/${d.department_id}`}>{d.name}</Link></td>
                <td className="num">{d.employees}</td>
                <td><ProgressBar value={d.course_progress} /></td>
                <td><ProgressBar value={d.task_progress} /></td>
                <td><ProgressBar value={d.onboarding_progress} /></td>
                <td><ProgressBar value={d.overall_progress} /></td>
                <td className="num">{d.overdue_tasks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      <div className="grid grid-2">
        <Card title="Needs attention">
          {attention.length === 0 ? (
            <EmptyState message="Everyone is tracking well right now." />
          ) : (
            <div className="stack">
              {attention.map((a) => (
                <div key={a.employee_id} className="row-between">
                  <Link className="link" href={`/employees/${a.employee_id}`}>{a.name}</Link>
                  <span className="subtle">{a.reason}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Departments requiring attention">
          {deptAttention.length === 0 ? (
            <EmptyState message="No department is falling behind." />
          ) : (
            <div className="stack">
              {deptAttention.map((d) => (
                <div key={d.department_id} className="row-between">
                  <Link className="link" href={`/departments/${d.department_id}`}>{d.name}</Link>
                  <span className="subtle">{d.reason}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <TableCard title="Employee progress" >
        <table className="table">
          <thead>
            <tr><th>Employee</th><th>Courses</th><th>Tasks</th><th>Onboarding</th><th>Overall</th></tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.employee_id}>
                <td><Person name={e.name} meta={e.job_title} href={`/employees/${e.employee_id}`} /></td>
                <td><ProgressBar value={e.course_progress} /></td>
                <td><ProgressBar value={e.task_progress} /></td>
                <td>{e.onboarding_status ? <StatusBadge status={e.onboarding_status} /> : <span className="subtle">—</span>}</td>
                <td><ProgressBar value={e.overall_progress} /></td>
              </tr>
            ))}
            {employees.length === 0 ? (
              <tr><td colSpan={5}><EmptyState message="No employees match these filters." /></td></tr>
            ) : null}
          </tbody>
        </table>
      </TableCard>
    </>
  );
}
