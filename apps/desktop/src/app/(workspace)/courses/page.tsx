import Link from 'next/link';
import {
  analyticsService, COURSE_STATUSES, courseService, dueLabel, dueState, EMPTY_STATES, formatDate,
} from '@snoopy/shared';
import { ClearFilters, SearchInput, SelectFilter } from '@/components/Filters';
import { Icon } from '@/components/Icon';
import { EmptyState, PageHead, ProgressBar, StatusBadge, TableCard } from '@/components/ui';
import { requireCapability, sessionCan } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function CoursesPage({
  searchParams,
}: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { q, status } = await searchParams;
  const session = await requireCapability('course.view');
  const db = await getServerSupabase();
  const isAdmin = session.profile.role === 'admin';
  const canCreate = sessionCan(session, 'course.create');

  // Employees see the courses they are actually assigned to; admins see the catalogue.
  if (!isAdmin) {
    const assignments = await courseService.listMyAssignments(db, session.userId);
    const filtered = assignments.filter((a) => {
      const matchesSearch = !q || (a.course?.title ?? '').toLowerCase().includes(q.toLowerCase());
      const matchesStatus = !status || status === 'All' || a.status === status;
      return matchesSearch && matchesStatus;
    });

    // What is late, then what is due, then everything else. A learner opening
    // this page should not have to sort their own obligations.
    const WEIGHT: Record<string, number> = { overdue: 0, due_soon: 1, upcoming: 2, none: 3, done: 4 };
    const ordered = [...filtered].sort((a, b) => {
      const byState = WEIGHT[dueState(a)] - WEIGHT[dueState(b)];
      if (byState !== 0) return byState;
      return (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999');
    });
    const outstanding = ordered.filter((a) => ['overdue', 'due_soon'].includes(dueState(a))).length;

    return (
      <>
        <PageHead
          title="My courses"
          subtitle={
            outstanding > 0
              ? `${outstanding} required ${outstanding === 1 ? 'course needs' : 'courses need'} your attention.`
              : 'Everything assigned to you, and how far along you are.'
          }
        />
        <div className="toolbar">
          <SearchInput placeholder="Search my courses…" />
          <SelectFilter
            name="status" label="Status" allLabel="Any status"
            options={['Pending', 'In Progress', 'Completed'].map((s) => ({ value: s, label: s }))}
          />
          <ClearFilters />
        </div>

        <TableCard>
          <table className="table">
            <thead><tr><th>Course</th><th>Status</th><th>Progress</th><th>Due</th></tr></thead>
            <tbody>
              {ordered.map((a) => {
                const state = dueState(a);
                return (
                  <tr key={a.id}>
                    <td>
                      <Link className="link" href={`/courses/${a.course_id}`}>{a.course?.title}</Link>
                      {a.is_required ? <span className={`req req-${state}`} style={{ marginLeft: 8 }}>Required</span> : null}
                    </td>
                    <td><StatusBadge status={a.status} /></td>
                    <td><ProgressBar value={a.progress} /></td>
                    <td className="subtle nowrap">
                      {a.is_required ? dueLabel(a, state) : formatDate(a.assigned_at)}
                    </td>
                  </tr>
                );
              })}
              {ordered.length === 0 ? (
                <tr><td colSpan={4}><EmptyState message={EMPTY_STATES.courses} /></td></tr>
              ) : null}
            </tbody>
          </table>
        </TableCard>
      </>
    );
  }

  const [courses, performance] = await Promise.all([
    courseService.listCourses(db, { search: q, status: (status as any) ?? 'All', includeArchived: status === 'Archived' }),
    analyticsService.listCoursePerformance(db),
  ]);
  const perfById = new Map(performance.map((p) => [p.course_id, p]));

  return (
    <>
      <PageHead
        title="Courses"
        subtitle="Create courses, assign learners and follow completion across the organisation."
        actions={canCreate ? (
          <Link className="btn btn-primary" href="/courses/new"><Icon name="plus" size={16} /> New course</Link>
        ) : null}
      />

      <div className="toolbar">
        <SearchInput placeholder="Search courses…" />
        <SelectFilter
          name="status" label="Status" allLabel="Any status"
          options={COURSE_STATUSES.map((s) => ({ value: s, label: s }))}
        />
        <ClearFilters />
      </div>

      <TableCard>
        <table className="table">
          <thead>
            <tr>
              <th>Course</th><th>Status</th><th className="num">Learners</th>
              <th>Average progress</th><th>Dates</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => {
              const p = perfById.get(c.id);
              return (
                <tr key={c.id}>
                  <td>
                    <Link className="link" href={`/courses/${c.id}`}>{c.title}</Link>
                    {c.description ? <div className="subtle truncate" style={{ maxWidth: 380 }}>{c.description}</div> : null}
                  </td>
                  <td><StatusBadge status={c.status} /></td>
                  <td className="num">{p?.assigned ?? 0}</td>
                  <td><ProgressBar value={p?.average_progress ?? 0} /></td>
                  <td className="subtle nowrap">{formatDate(c.start_date)} → {formatDate(c.end_date)}</td>
                </tr>
              );
            })}
            {courses.length === 0 ? (
              <tr><td colSpan={5}><EmptyState title="No courses yet" message="Create the first course to start assigning learners." /></td></tr>
            ) : null}
          </tbody>
        </table>
      </TableCard>
    </>
  );
}
