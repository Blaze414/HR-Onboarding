import { courseService, employeeService } from '@snoopy/shared';
import { TaskForm } from '@/components/TaskForm';
import { PageHead } from '@/components/ui';
import { requireAdmin } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function NewTaskPage() {
  await requireAdmin();
  const db = await getServerSupabase();
  const [employees, courses] = await Promise.all([
    employeeService.listEmployees(db, { activeOnly: true }),
    courseService.listCourses(db),
  ]);
  return (
    <>
      <PageHead title="New task" subtitle="Tasks belong to the organisation; the assignee is who has to do the work." />
      <section className="card"><div className="card-body">
        <TaskForm employees={employees} courses={courses} />
      </div></section>
    </>
  );
}
