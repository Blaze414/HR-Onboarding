'use client';

import type { OnboardingStep } from '@snoopy/shared';
import { completeStepAction } from '@/lib/actions';
import { Icon } from './Icon';
import { useAction } from './Interactive';

export function StepToggle({ step, canEdit }: { step: OnboardingStep; canEdit: boolean }) {
  const { busy, error, call } = useAction();
  const done = step.status === 'Completed';

  return (
    <div className={`step${done ? ' done' : ''}`}>
      <input
        type="checkbox" className="checkbox" checked={done} disabled={!canEdit || busy}
        aria-label={done ? `Reopen ${step.title}` : `Complete ${step.title}`}
        onChange={(e) => call(() => completeStepAction(step.id, e.target.checked))}
      />
      <span className="order">{step.sort_order}</span>
      <span className="title">{step.title}</span>
      <span className="badge">{step.type}</span>
      {done ? <Icon name="check" size={16} /> : null}
      {error ? <span className="error" role="alert">{error}</span> : null}
    </div>
  );
}
