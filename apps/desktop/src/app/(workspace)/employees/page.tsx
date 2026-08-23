import Link from 'next/link';
import { analyticsService, EMPTY_STATES, employeeService, formatDate } from '@snoopy/shared';
import { ClearFilters, SearchInput, SelectFilter } from '@/components/Filters';
import { Icon } from '@/components/Icon';
import { EmptyState, PageHead, Person, ProgressBar, StatusBadge, TableCard } from '@/components/ui';
import { requireCapability } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function EmployeesPage({
  searchParams,
}: { searchParams: Promise<{ q?: string; department?: string; role?: string }> }) {
  const { q, department, role } = await searchParams;
  await requireCapability('employee.view_all');
  const db = await getServerSupabase();

  const [employees, departments, progress] = await Promise.all([
    employeeService.listEmployees(db, {
      search: q, departmentId: (department as any) ?? 'All', role: (role as any) ?? 'All',
    }),
    employeeService.listDepartments(db),
    analyticsService.listEmployeeProgress(db),
  ]);
  const progressById = new Map(progress.map((p) => [p.employee_id, p]));

  return (
    <>
      <PageHead
        title="Employees"
        subtitle="Everyone in the organisation, with how their learning and onboarding is tracking."
        actions={<Link className="btn btn-primary" href="/employees/new"><Icon name="plus" size={16} /> Add employee</Link>}
      />

      <div className="toolbar">
        <SearchInput placeholder="Search by name or email…" />
        <SelectFilter name="department" label="Department" allLabel="All departments"
          options={departments.map((d) => ({ value: d.id, label: d.name }))} />
        <SelectFilter name="role" label="Role" allLabel="Any role"
          options={[{ value: 'employee', label: 'Employee' }, { value: 'admin', label: 'Admin' }]} />
        <ClearFilters />
      </div>

      <TableCard title={`${employees.length} employee${employees.length === 1 ? '' : 's'}`}>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th><th>Department</th><th>Job title</th><th>Role</th>
              <th>Overall progress</th><th>Onboarding</th><th>Started</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => {
              const p = progressById.get(e.id);
              return (
                <tr key={e.id}>
                  <td>
                    <Person name={e.name} meta={e.email} href={`/employees/${e.id}`} />
                    {!e.is_active ? <span className="badge" style={{ marginLeft: 8 }}>Inactive</span> : null}
                  </td>
                  <td className="subtle">{e.department?.name ?? '—'}</td>
                  <td className="subtle">{e.job_title ?? '—'}</td>
                  <td><StatusBadge status={e.role} /></td>
                  <td><ProgressBar value={p?.overall_progress ?? null} /></td>
                  <td><ProgressBar value={p?.onboarding_progress ?? null} /></td>
                  <td className="subtle nowrap">{formatDate(e.start_date)}</td>
                </tr>
              );
            })}
            {employees.length === 0 ? (
              <tr><td colSpan={7}><EmptyState message={EMPTY_STATES.employees} /></td></tr>
            ) : null}
          </tbody>
        </table>
      </TableCard>
    </>
  );
}
