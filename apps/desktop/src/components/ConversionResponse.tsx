'use client';

import { LOCALE, REFUSAL_GROUNDS, type ConversionNotice, type RefusalGround } from '@snoopy/shared';
import { useState } from 'react';
import {
  acceptConversionAction, recordConsultationAction, refuseConversionAction,
} from '@/lib/actions';
import { Field, Overlay, useAction } from './Interactive';
import { Icon } from './Icon';

/**
 * Answering a notice to become permanent.
 *
 * The two steps are separate on the screen because they are separate in law.
 * Consultation comes first and the database will not accept an answer without
 * it, so offering both at once would only produce a refusal a person then has
 * to make sense of.
 */
export function ConversionResponse({ notice }: { notice: ConversionNotice }) {
  const { busy, error, call } = useAction();
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<'accept' | 'refuse'>('accept');
  const [hours, setHours] = useState<'Full-time' | 'Part-time'>('Full-time');
  const [basis, setBasis] = useState<'Ongoing' | 'Fixed term'>('Ongoing');
  const [ground, setGround] = useState<RefusalGround>(REFUSAL_GROUNDS[0].value);
  const [note, setNote] = useState('');

  if (!notice.consulted_at) {
    return (
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button
          className="btn btn-sm" disabled={busy} aria-busy={busy}
          onClick={() => call(() => recordConsultationAction(notice.id))}
        >
          <Icon name="check" size={15} /> {busy ? 'Recording…' : 'Record consultation'}
        </button>
        {error ? <span className="error" role="alert">{error}</span> : null}
      </div>
    );
  }

  return (
    <>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-sm btn-primary" onClick={() => setOpen(true)}>Answer in writing</button>
      </div>

      {open ? (
        <Overlay title={`Answer ${notice.employee_name}`} onClose={() => setOpen(false)}>
          <p className="muted">
            Consulted {new Date(notice.consulted_at).toLocaleDateString(LOCALE)}. This answer is the
            written response required within 21 days, and it is kept on the record.
          </p>

          <Field label="Decision">
            <select className="select" value={decision} onChange={(e) => setDecision(e.target.value as 'accept' | 'refuse')}>
              <option value="accept">Accept — the employment becomes permanent</option>
              <option value="refuse">Refuse</option>
            </select>
          </Field>

          {decision === 'accept' ? (
            <div className="grid grid-2">
              <Field label="Hours">
                <select className="select" value={hours} onChange={(e) => setHours(e.target.value as 'Full-time' | 'Part-time')}>
                  <option>Full-time</option><option>Part-time</option>
                </select>
              </Field>
              <Field label="Basis">
                <select className="select" value={basis} onChange={(e) => setBasis(e.target.value as 'Ongoing' | 'Fixed term')}>
                  <option>Ongoing</option><option>Fixed term</option>
                </select>
              </Field>
            </div>
          ) : (
            <Field
              label="Ground for refusing"
              hint="These are the only grounds on which a notice may be refused."
            >
              <select className="select" value={ground} onChange={(e) => setGround(e.target.value as RefusalGround)}>
                {REFUSAL_GROUNDS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
              <span className="hint">{REFUSAL_GROUNDS.find((g) => g.value === ground)?.help}</span>
            </Field>
          )}

          <Field label="Written response" hint="What the employee is told, in your words.">
            <textarea
              className="input" rows={4} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder={decision === 'accept'
                ? 'Your employment becomes permanent from the start of the next pay period.'
                : 'Why this ground applies to this role.'}
            />
          </Field>

          {error ? <div className="alert" role="alert">{error}</div> : null}

          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button
              className="btn btn-primary" disabled={busy} aria-busy={busy}
              onClick={() => call(
                () => (decision === 'accept'
                  ? acceptConversionAction({ id: notice.id, hours, basis, note })
                  : refuseConversionAction({ id: notice.id, ground, note })),
                () => setOpen(false),
              )}
            >
              {busy ? 'Sending…' : 'Send the answer'}
            </button>
          </div>
        </Overlay>
      ) : null}
    </>
  );
}
