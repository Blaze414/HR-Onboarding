'use client';

import type { PolicyRequirement } from '@snoopy/shared';
import { claimPolicyAction } from '@/lib/actions';
import { useAction } from './Interactive';

/**
 * Say which document answers an obligation.
 *
 * Only shared documents appear: a workplace policy is published to everybody
 * by definition, and the database refuses to let a personal document claim one.
 */
export function ClaimPolicy({
  requirement, documentId, documents,
}: {
  requirement: PolicyRequirement;
  documentId: string | null;
  documents: { id: string; name: string }[];
}) {
  const { busy, error, call } = useAction();
  return (
    <>
      <select
        className="select" disabled={busy} value={documentId ?? ''}
        aria-label={`Policy for ${requirement}`}
        onChange={(e) => call(() => claimPolicyAction(e.target.value || null, requirement, documentId))}
      >
        <option value="">No document</option>
        {documents.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
      {error ? <div className="error" role="alert">{error}</div> : null}
    </>
  );
}
