'use client';

import type { EventResponse } from '@snoopy/shared';
import { rsvpAction } from '@/lib/actions';
import { useAction } from './Interactive';

const OPTIONS: EventResponse[] = ['Going', 'Maybe', 'Declined'];

export function RsvpControl({ eventId, response }: { eventId: string; response: EventResponse | null }) {
  const { busy, error, call } = useAction();
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row">
        {OPTIONS.map((o) => (
          <button
            key={o} className={`btn btn-sm${response === o ? ' btn-primary' : ''}`}
            disabled={busy} onClick={() => call(() => rsvpAction(eventId, o))}
          >
            {o}
          </button>
        ))}
      </div>
      {error ? <span className="error" role="alert">{error}</span> : null}
    </div>
  );
}
