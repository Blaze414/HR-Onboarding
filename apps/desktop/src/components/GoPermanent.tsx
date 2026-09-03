'use client';

import { LOCALE, type ConversionNotice } from '@snoopy/shared';
import { useState } from 'react';
import { giveConversionNoticeAction, withdrawConversionNoticeAction } from '@/lib/actions';
import { Field, useAction } from './Interactive';

/**
 * A casual's own move.
 *
 * The point of the employee choice pathway is that this does not wait for an
 * offer, so it lives on the employee's own profile rather than somewhere HR
 * has to visit. When it is not available the reason is shown, with the date it
 * becomes available — "not yet" without a date is the same as "no".
 */
export function GoPermanent({
  eligible, reason, notice,
}: { eligible: boolean; reason: string; notice: ConversionNotice | null }) {
  const { busy, error, call } = useAction();
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);

  if (notice && notice.status === 'Awaiting response') {
    return (
      <div className="stack">
        <p>
          You gave notice on {new Date(notice.given_at).toLocaleDateString(LOCALE)}. A written
          answer is owed by <strong>{new Date(notice.due_by).toLocaleDateString(LOCALE)}</strong>.
        </p>
        <p className="muted">
          {notice.consulted_at
            ? 'You have been consulted. The written answer comes next.'
            : 'Your employer has to consult you before answering.'}
        </p>
        <div className="row">
          <button
            className="btn btn-sm" disabled={busy} aria-busy={busy}
            onClick={() => call(() => withdrawConversionNoticeAction(notice.id))}
          >
            {busy ? 'Withdrawing…' : 'Withdraw my notice'}
          </button>
        </div>
        {error ? <span className="error" role="alert">{error}</span> : null}
      </div>
    );
  }

  if (notice && notice.status !== 'Awaiting response') {
    return (
      <div className="stack">
        <p>
          Your notice of {new Date(notice.given_at).toLocaleDateString(LOCALE)} was{' '}
          <strong>{notice.status.toLowerCase()}</strong>
          {notice.responded_at ? ` on ${new Date(notice.responded_at).toLocaleDateString(LOCALE)}` : ''}.
        </p>
        {notice.refusal_ground ? <p className="muted">Ground given: {notice.refusal_ground}</p> : null}
        {notice.response_note ? <blockquote className="muted">{notice.response_note}</blockquote> : null}
        <p className="muted">{reason}</p>
      </div>
    );
  }

  if (!eligible) return <p className="muted">{reason}</p>;

  return (
    <div className="stack">
      <p className="muted">
        You can tell your employer in writing that you want to become permanent. They have to
        consult you and answer in writing within 21 days, and can only refuse on limited grounds.
      </p>
      {open ? (
        <>
          <Field label="Anything you want to say" hint="Optional. It goes on the record with your notice.">
            <textarea
              className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="I have worked the same shifts every week since I started."
            />
          </Field>
          <div className="row">
            <button
              className="btn btn-primary btn-sm" disabled={busy} aria-busy={busy}
              onClick={() => call(() => giveConversionNoticeAction(note), () => setOpen(false))}
            >
              {busy ? 'Sending…' : 'Give notice'}
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </>
      ) : (
        <div className="row">
          <button className="btn btn-sm" onClick={() => setOpen(true)}>Ask to become permanent</button>
        </div>
      )}
      {error ? <span className="error" role="alert">{error}</span> : null}
    </div>
  );
}
