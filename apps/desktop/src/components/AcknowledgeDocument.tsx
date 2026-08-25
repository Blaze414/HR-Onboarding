'use client';

import { acknowledgeDocumentAction } from '@/lib/actions';
import { Icon } from './Icon';
import { useAction } from './Interactive';

/**
 * "I have read this."
 *
 * Deliberately not a checkbox that can be toggled: an acknowledgement is a fact
 * about a moment, so once given it is stated rather than offered again.
 */
export function AcknowledgeDocument({
  documentId, acknowledged, updatedSinceRead = false,
}: { documentId: string; acknowledged: boolean; updatedSinceRead?: boolean }) {
  const { busy, error, call } = useAction();

  if (acknowledged) {
    return (
      <span className="ack-done">
        <Icon name="check" size={14} /> Acknowledged
      </span>
    );
  }

  return (
    <>
      <button
        className="btn btn-sm btn-primary"
        disabled={busy}
        onClick={() => call(() => acknowledgeDocumentAction(documentId))}
      >
        {busy ? 'Recording…' : updatedSinceRead ? 'I have read the new version' : 'I have read this'}
      </button>
      {/* Read an older version: a different sentence to "never seen it". */}
      {updatedSinceRead ? <span className="subtle">Updated since you read it</span> : null}
      {error ? <span className="subtle" role="alert">{error}</span> : null}
    </>
  );
}
