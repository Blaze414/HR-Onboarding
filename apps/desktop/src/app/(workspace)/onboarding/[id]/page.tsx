import { notFound } from 'next/navigation';
import { relativeDueLabel, EMPTY_STATES, formatDate, onboardingService } from '@snoopy/shared';
import { ActionButton } from '@/components/Interactive';
import { StepToggle } from '@/components/StepToggle';
import { Card, PageHead, Person, ProgressBar, StatusBadge } from '@/components/ui';
import { deleteOnboardingAction } from '@/lib/actions';
import { requireSession } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function OnboardingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const db = await getServerSupabase();
  const plan = await onboardingService.getOnboarding(db, id);
  if (!plan) notFound();

  const isAdmin = session.profile.role === 'admin';
  const canEdit = isAdmin || plan.employee_id === session.userId;

  return (
    <>
      <PageHead
        title={`${plan.employee?.name ?? 'Onboarding'}`}
        subtitle={plan.template?.name ?? undefined}
        actions={isAdmin ? (
          <ActionButton
            label="Delete plan" icon="trash" variant="danger" small={false}
            confirm="Delete this onboarding plan and all of its steps?"
            action={deleteOnboardingAction.bind(null, id)}
          />
        ) : null}
      />

      <div className="grid grid-2" style={{ marginBottom: 18 }}>
        <Card title="Progress">
          <div className="stack">
            <ProgressBar value={plan.progress} />
            <div className="row"><StatusBadge status={plan.status} /></div>
            {plan.progress === 100 ? <p className="muted">{EMPTY_STATES.onboardingComplete}</p> : null}
          </div>
        </Card>
        <Card title="Plan details">
          <dl className="dl">
            <dt>Employee</dt>
            <dd><Person name={plan.employee?.name ?? '—'} href={isAdmin ? `/employees/${plan.employee_id}` : undefined} /></dd>
            <dt>Started</dt><dd>{formatDate(plan.start_date)}</dd>
            <dt>Target</dt><dd>{formatDate(plan.target_completion_date)} · <span className="subtle">{relativeDueLabel(plan.target_completion_date, plan.status === 'Completed')}</span></dd>
            <dt>Completed</dt><dd>{plan.completed_at ? formatDate(plan.completed_at) : '—'}</dd>
          </dl>
        </Card>
      </div>

      <Card title="Steps">
        <div className="step-list">
          {(plan.steps ?? []).map((s) => <StepToggle key={s.id} step={s} canEdit={canEdit} />)}
        </div>
      </Card>
    </>
  );
}
