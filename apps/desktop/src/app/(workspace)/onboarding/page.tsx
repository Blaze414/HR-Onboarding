import Link from 'next/link';
import {
  EMPTY_STATES, employeeService, formatDate, formatRelativeDay, onboardingService,
} from '@snoopy/shared';
import { StartOnboarding } from '@/components/StartOnboarding';
import { StepToggle } from '@/components/StepToggle';
import { Card, EmptyState, PageHead, Person, ProgressBar, StatusBadge, TableCard } from '@/components/ui';
import { requireCapability, sessionCan } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const session = await requireCapability('onboarding.view');
  const db = await getServerSupabase();
  const isAdmin = sessionCan(session, 'onboarding.create');

  if (!isAdmin) {
    const plan = await onboardingService.getMyOnboarding(db, session.userId);
    if (!plan) {
      return (
        <>
          <PageHead title="My onboarding" />
          <section className="card"><div className="card-body">
            <EmptyState title="Nothing to complete" message="No onboarding plan is assigned to you right now." />
          </div></section>
        </>
      );
    }
    const done = (plan.steps ?? []).filter((s) => s.status === 'Completed').length;
    return (
      <>
        <PageHead
          title="My onboarding"
          subtitle={`${done} of ${plan.steps?.length ?? 0} steps complete · target ${formatRelativeDay(plan.target_completion_date)}`}
        />
        <div className="grid grid-2" style={{ marginBottom: 18 }}>
          <Card title="Progress">
            <div className="stack">
              <ProgressBar value={plan.progress} />
              <StatusBadge status={plan.status} />
              {plan.progress === 100 ? <p className="muted">{EMPTY_STATES.onboardingComplete}</p> : null}
            </div>
          </Card>
          <Card title="Plan">
            <dl className="dl">
              <dt>Template</dt><dd>{plan.template?.name ?? '—'}</dd>
              <dt>Started</dt><dd>{formatDate(plan.start_date)}</dd>
              <dt>Target</dt><dd>{formatDate(plan.target_completion_date)}</dd>
            </dl>
          </Card>
        </div>
        <Card title="Steps">
          <div className="step-list">
            {(plan.steps ?? []).map((s) => <StepToggle key={s.id} step={s} canEdit />)}
          </div>
        </Card>
      </>
    );
  }

  const [plans, employees, templates] = await Promise.all([
    onboardingService.listOnboarding(db),
    employeeService.listEmployees(db, { activeOnly: true }),
    onboardingService.listTemplates(db),
  ]);

  return (
    <>
      <PageHead
        title="Onboarding"
        subtitle="Start plans from a template, then follow each new starter through their steps."
        actions={
          <>
            <Link className="btn" href="/onboarding/templates">Templates</Link>
            <StartOnboarding employees={employees} templates={templates} />
          </>
        }
      />

      <TableCard title={`${plans.length} plan${plans.length === 1 ? '' : 's'}`}>
        <table className="table">
          <thead>
            <tr><th>Employee</th><th>Template</th><th>Progress</th><th>Status</th><th>Started</th><th>Target</th></tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id}>
                <td><Person name={p.employee?.name ?? 'Unknown'} meta={p.employee?.job_title} href={`/onboarding/${p.id}`} /></td>
                <td className="subtle">{p.template?.name ?? '—'}</td>
                <td><ProgressBar value={p.progress} /></td>
                <td><StatusBadge status={p.status} /></td>
                <td className="subtle nowrap">{formatDate(p.start_date)}</td>
                <td className="subtle nowrap">{formatRelativeDay(p.target_completion_date)}</td>
              </tr>
            ))}
            {plans.length === 0 ? (
              <tr><td colSpan={6}><EmptyState title="No plans yet" message="Create a template, then start onboarding for a new starter." /></td></tr>
            ) : null}
          </tbody>
        </table>
      </TableCard>
    </>
  );
}
