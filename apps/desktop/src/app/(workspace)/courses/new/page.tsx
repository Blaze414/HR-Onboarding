import { CourseForm } from '@/components/CourseForm';
import { PageHead } from '@/components/ui';
import { requireAdmin } from '@/lib/session';

export default async function NewCoursePage() {
  await requireAdmin();
  return (
    <>
      <PageHead title="New course" subtitle="Courses belong to the organisation. Learners are assigned separately." />
      <section className="card"><div className="card-body"><CourseForm /></div></section>
    </>
  );
}
