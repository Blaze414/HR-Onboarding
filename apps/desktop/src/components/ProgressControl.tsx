'use client';

import { useState } from 'react';
import { updateProgressAction } from '@/lib/actions';
import { useAction } from './Interactive';

/** A learner moving their own course progress. Steps of 25% keep it quick. */
export function ProgressControl({
  assignmentId, progress,
}: { assignmentId: string; progress: number }) {
  const [value, setValue] = useState(progress);
  const { busy, error, call } = useAction();

  const save = (next: number) => {
    setValue(next);
    call(() => updateProgressAction(assignmentId, next));
  };

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row">
        {[0, 25, 50, 75, 100].map((step) => (
          <button
            key={step} className={`btn btn-sm${value === step ? ' btn-primary' : ''}`}
            disabled={busy} onClick={() => save(step)}
          >
            {step}%
          </button>
        ))}
      </div>
      {value === 100 ? <p className="subtle">Completed — Snoopy approves.</p> : null}
      {error ? <span className="error" role="alert">{error}</span> : null}
    </div>
  );
}
