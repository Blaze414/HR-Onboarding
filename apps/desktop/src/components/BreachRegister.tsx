'use client';

import type { Breach, BreachDecision } from '@snoopy/shared';
import { useState } from 'react';
import { assessBreachAction, recordBreachAction, recordBreachNotificationAction } from '@/lib/actions';
import { Field, Overlay, useAction } from './Interactive';

const DECISIONS: { value: BreachDecision; label: string; help: string }[] = [
  {
    value: 'Eligible — notification required',
    label: 'Eligible — the OAIC and the people affected must be told',
    help: 'There are reasonable grounds to believe this is likely to result in serious harm.',
  },
  {
    value: 'Not eligible',
    label: 'Not an eligible data breach',
    help: 'Serious harm is not likely. The reasoning is the record; write it as if it will be read by somebody who disagrees.',
  },
  {
    value: 'Remediated before serious harm',
    label: 'Remediated before serious harm was likely',
    help: 'Action taken quickly enough that serious harm is no longer likely. This is a specific exception, not a general one.',
  },
];

/** Report a suspected breach. The thirty days run from suspicion, not from here. */
export function RecordBreach() {
  const { busy, error, call } = useAction();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState('');
  const [information, setInformation] = useState('');
  const [suspectedAt, setSuspectedAt] = useState('');

  return (
    <>
      <button className="btn btn-sm btn-primary" onClick={() => setOpen(true)}>Record a suspected breach</button>
      {open ? (
        <Overlay title="Record a suspected breach" onClose={() => setOpen(false)}>
          <p className="muted">
            Recording this starts a thirty-day assessment clock. Thirty days is the outer
            limit under the Notifiable Data Breaches scheme, not the target.
          </p>
          <Field label="What happened">
            <textarea
              className="input" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)}
              placeholder="An employee's personal documents were downloaded from a session that was not theirs."
            />
          </Field>
          <Field label="What information was involved" hint="Described, not categorised — this is what the notification has to say.">
            <textarea
              className="input" rows={2} value={information}
              onChange={(e) => setInformation(e.target.value)}
              placeholder="Signed employment agreements, including home addresses and dates of birth."
            />
          </Field>
          <Field
            label="When it was first suspected"
            hint="Leave blank for now. Backdate it if the suspicion came earlier — the clock runs from then."
          >
            <input
              className="input" type="datetime-local" value={suspectedAt}
              onChange={(e) => setSuspectedAt(e.target.value)}
            />
          </Field>
          {error ? <div className="alert" role="alert">{error}</div> : null}
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button
              className="btn btn-primary" disabled={busy || !summary.trim()}
              onClick={() => call(
                () => recordBreachAction({ summary, information, suspectedAt }),
                () => setOpen(false),
              )}
            >
              {busy ? 'Recording…' : 'Start the clock'}
            </button>
          </div>
        </Overlay>
      ) : null}
    </>
  );
}

/** Close an assessment, or record that a notification went out. */
export function BreachActions({ breach }: { breach: Breach }) {
  const { busy, error, call } = useAction();
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<BreachDecision>('Eligible — notification required');
  const [note, setNote] = useState('');
  const [affected, setAffected] = useState('');

  if (breach.decision === 'Assessing') {
    return (
      <>
        <button className="btn btn-sm" onClick={() => setOpen(true)}>Record the assessment</button>
        {open ? (
          <Overlay title="What did the assessment find?" onClose={() => setOpen(false)}>
            <Field label="Finding">
              <select className="select" value={decision} onChange={(e) => setDecision(e.target.value as BreachDecision)}>
                {DECISIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
              <span className="hint">{DECISIONS.find((d) => d.value === decision)?.help}</span>
            </Field>
            <Field label="What you found, and why" hint="Required. This is the reasoning the decision rests on.">
              <textarea className="input" rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <Field label="People affected" hint="Optional, and an estimate is fine.">
              <input className="input" type="number" min={0} value={affected} onChange={(e) => setAffected(e.target.value)} />
            </Field>
            {error ? <div className="alert" role="alert">{error}</div> : null}
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
              <button
                className="btn btn-primary" disabled={busy || !note.trim()}
                onClick={() => call(
                  () => assessBreachAction({
                    id: breach.id, decision, note,
                    peopleAffected: affected ? Number(affected) : undefined,
                  }),
                  () => setOpen(false),
                )}
              >
                {busy ? 'Saving…' : 'Record it'}
              </button>
            </div>
          </Overlay>
        ) : null}
      </>
    );
  }

  if (breach.decision !== 'Eligible — notification required') return null;

  return (
    <div className="row" style={{ justifyContent: 'flex-end' }}>
      {!breach.oaic_notified_at ? (
        <button
          className="btn btn-sm" disabled={busy}
          onClick={() => call(() => recordBreachNotificationAction({ id: breach.id, oaic: true }))}
        >
          OAIC told
        </button>
      ) : null}
      {!breach.individuals_notified_at ? (
        <button
          className="btn btn-sm" disabled={busy}
          onClick={() => call(() => recordBreachNotificationAction({ id: breach.id, individuals: true }))}
        >
          People told
        </button>
      ) : null}
      {error ? <span className="error" role="alert">{error}</span> : null}
    </div>
  );
}
