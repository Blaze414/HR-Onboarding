import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  activityService, analyticsService, courseService, employeeService,
  formatDate, formatDateTime,
} from '@snoopy/shared';
import { AssignLearners } from '@/components/AssignLearners';
import { CourseForm } from '@/components/CourseForm';
import { ActionButton } from '@/components/Interactive';
import { ProgressControl } from '@/components/ProgressControl';
import { Card, EmptyState, PageHead, Person, ProgressBar, StatusBadge, Tabs, TableCard } from '@/components/ui';
import { archiveCourseAction, unassignCourseAction } from '@/lib/actions';
import { requireSession, sessionCan } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function CourseDetailPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab = 'overview' } = await searchParams;
  const session = await requireSession();
  const db = await getServerSupabase();
  const isAdmin = session.profile.role === 'admin';

  const course = await courseService.getCourse(db, id);
  if (!course) notFound();

  const [learners, myAssignments, performance] = await Promise.all([
    isAdmin ? courseService.listCourseLearners(db, id) : Promise.resolve([]),
    courseService.listMyAssignments(db, session.userId),
    isAdmin ? analyticsService.listCoursePerformance(db) : Promise.resolve([]),
  ]);
  const mine = myAssignments.find((a) => a.course_id === id);
  const perf = performance.find((p) => p.course_id === id);

  const tabs = [
    { href: `/courses/${id}`, label: 'Overview' },
    ...(isAdmin ? [
      { href: `/courses/${id}?tab=learners`, label: 'Learners' },
      { href: `/courses/${id}?tab=edit`, label: 'Edit' },
      { href: `/courses/${id}?tab=activity`, label: 'Activity' },
    ] : []),
  ];
  const currentHref = tab === 'overview' ? `/courses/${id}` : `/courses/${id}?tab=${tab}`;

  return (
    <>
      <PageHead
        title={course.title}
        subtitle={course.description ?? undefined}
        actions={
          isAdmin && sessionCan(session, 'course.edit') ? (
            <ActionButton
              label={course.status === 'Archived' ? 'Restore course' : 'Archive course'}
              icon="archive"
              // Bound rather than wrapped in a closure: a server component may hand a
              // client component a server-action reference, but never a plain function.
              action={archiveCourseAction.bind(null, id, course.status !== 'Archived')}
              confirm={course.status === 'Archived' ? undefined : 'Archive this course? Learners keep their history.'}
              small={false}
            />
          ) : null
        }
      />

      <Tabs tabs={tabs} current={currentHref} />

      {tab === 'overview' ? (
        <div className="grid grid-2">
          <Card title="Course details">
            <dl className="dl">
              <dt>Status</dt><dd><StatusBadge status={course.status} /></dd>
              <dt>Starts</dt><dd>{formatDate(course.start_date)}</dd>
              <dt>Ends</dt><dd>{formatDate(course.end_date)}</dd>
              {isAdmin ? (<><dt>Learners assigned</dt><dd>{perf?.assigned ?? 0}</dd></>) : null}
              {isAdmin ? (<><dt>Average progress</dt><dd><ProgressBar value={perf?.average_progress ?? 0} /></dd></>) : null}
            </dl>
          </Card>

          <Card title="My progress">
            {mine ? (
              <div className="stack">
                <div className="row-between">
                  <StatusBadge status={mine.status} />
                  <span className="subtle">Assigned {formatDate(mine.assigned_at)}</span>
                </div>
                <ProgressBar value={mine.progress} />
                <ProgressControl assignmentId={mine.id} progress={mine.progress} />
              </div>
            ) : (
              <EmptyState message="This course is not assigned to you." />
            )}
          </Card>
        </div>
      ) : null}

      {tab === 'learners' && isAdmin ? (
        <LearnersTab courseId={id} learners={learners} db={db} />
      ) : null}

      {tab === 'edit' && isAdmin ? (
        <section className="card"><div className="card-body"><CourseForm course={course} /></div></section>
      ) : null}

      {tab === 'activity' && isAdmin ? (
        <CourseActivity courseId={id} db={db} />
      ) : null}
    </>
  );
}

async function LearnersTab({ courseId, learners, db }: { courseId: string; learners: any[]; db: any }) {
  const [employees, departments] = await Promise.all([
    employeeService.listEmployees(db, { activeOnly: true }),
    employeeService.listDepartments(db),
  ]);
  const assignedIds = new Set(learners.map((l) => l.user_id));
  const candidates = employees.filter((e) => !assignedIds.has(e.id));

  return (
    <TableCard
      title={`${learners.length} learner${learners.length === 1 ? '' : 's'}`}
      action={<AssignLearners courseId={courseId} candidates={candidates} departments={departments} />}
    >
      <table className="table">
        <thead><tr><th>Learner</th><th>Status</th><th>Progress</th><th>Completed</th><th /></tr></thead>
        <tbody>
          {learners.map((l) => (
            <tr key={l.id}>
              <td><Person name={l.user?.name ?? 'Unknown'} meta={l.user?.job_title} href={`/employees/${l.user_id}`} /></td>
              <td><StatusBadge status={l.status} /></td>
              <td><ProgressBar value={l.progress} /></td>
              <td className="subtle nowrap">{l.completed_at ? formatDateTime(l.completed_at) : '—'}</td>
              <td className="actions">
                <ActionButton
                  label="Remove" icon="trash" variant="danger"
                  confirm="Remove this learner from the course? Their progress is deleted."
                  action={async () => {
                    'use server';
                    return unassignCourseAction(l.id, courseId);
                  }}
                />
              </td>
            </tr>
          ))}
          {learners.length === 0 ? (
            <tr><td colSpan={5}><EmptyState message="Nobody is assigned to this course yet." /></td></tr>
          ) : null}
        </tbody>
      </table>
    </TableCard>
  );
}

async function CourseActivity({ courseId, db }: { courseId: string; db: any }) {
  const entries = (await activityService.listActivity(db, 50))
    .filter((e) => e.entity_id === courseId || (e.metadata as any)?.course_id === courseId);
  return (
    <Card title="Course activity">
      {entries.length === 0 ? (
        <EmptyState message="No activity recorded for this course yet." />
      ) : (
        <div className="stack">
          {entries.map((e) => (
            <div key={e.id} className="row-between">
              <span>{activityService.describeActivity(e)}</span>
              <span className="subtle nowrap">{formatDateTime(e.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
