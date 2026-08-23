'use client';

import { useState } from 'react';
import { startOnboardingAction } from '@/lib/actions';
import { Field, Overlay, useAction } from './Interactive';

/**
 * Starts an exit plan.
 *
 * Uses the same machinery as joining, because leaving is equally structured —
 * hand over the work, return the equipment, close the accounts, have the
 * conversation. Offered from the employee page rather than a separate screen,
 * since that is where somebody is standing when they learn a person is leaving.
 */
export function StartOffboarding({
  employeeId, employeeName, templates,
}: { employeeId: string; employeeName: string; templates: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [lastDay, setLastDay] = useState('');
  const { busy, error, setError, call } = useAction();

  return (
    <>
      <button className="btn btn-sm" onClick={() => setOpen(true)}>Start offboarding</button>

      {open ? (
        <Overlay
          title={`Start offboarding for ${employeeName}`}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
              <button
                className="btn btn-primary" disabled={busy || !templateId}
                onClick={() => {
                  if (!templateId) { setError('Choose an exit plan.'); return; }
                  call(
                    () => startOnboardingAction({
                      employeeId, templateId, targetDate: lastDay || undefined,
                    }),
                    () => setOpen(false),
                  );
                }}
              >
                {busy ? 'Starting…' : 'Start exit plan'}
              </button>
            </>
          }
        >
          {error ? <div className="alert" role="alert">{error}</div> : null}

          <Field label="Exit plan">
            <select className="select" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>

          <Field label="Last day" hint="Every step is worked back from this date.">
            <input className="input" type="date" value={lastDay} onChange={(e) => setLastDay(e.target.value)} />
          </Field>
        </Overlay>
      ) : null}
    </>
  );
}
