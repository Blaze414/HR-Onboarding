import {
  courseService, documentRequestService, employeeService, onboardingService, roleService,
} from '@snoopy/shared';
import { EmployeeForm } from '@/components/EmployeeForm';
import { PageHead } from '@/components/ui';
import { requireCapability } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function NewEmployeePage() {
  await requireCapability('employee.create');
  const db = await getServerSupabase();
  const [departments, managers, roles, templates, checklists, courses] = await Promise.all([
    employeeService.listDepartments(db),
    employeeService.listEmployees(db, { activeOnly: true }),
    roleService.listRoles(db),
    onboardingService.listTemplatesOfKind(db, 'Onboarding').catch(() => []),
    documentRequestService.listChecklists(db, 'Onboarding').catch(() => []),
    courseService.listCourses(db, { status: 'All' }).catch(() => []),
  ]);
  return (
    <>
      <PageHead
        title="Add employee"
        subtitle="Creates their sign-in account and sets up their first week in one go."
      />
      <section className="card"><div className="card-body">
        <EmployeeForm
          departments={departments}
          managers={managers}
          roles={roles}
          onboardingTemplates={(templates as { id: string; name: string }[]).map((t) => ({ id: t.id, name: t.name }))}
          checklists={(checklists as { id: string; name: string; kind: string }[])
            .map((c) => ({ id: c.id, name: c.name, kind: c.kind }))}
          courses={courses.filter((c) => c.status !== 'Archived').map((c) => ({ id: c.id, title: c.title }))}
        />
      </div></section>
    </>
  );
}
