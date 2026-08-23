'use client';

import { useState } from 'react';
import { removeChecklistAutomationAction, setChecklistAutomationAction } from '@/lib/actions';
import { Icon } from './Icon';
import { Field, Overlay, useAction } from './Interactive';

/**
 * The rule that fires a checklist when somebody joins.
 *
 * Stated once so nobody has to remember it on the day — which is the busiest
 * possible moment to ask HR to remember anything. A rule names a checklist and
 * either the whole workspace or one department, and several rules can run
 * together: everybody gets the general pack, developers also get theirs.
 */
export function AutomationEditor({
  checklists, departments,
}: {
  checklists: { id: string; name: string; kind: string }[];
  departments: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [checklistId, setChecklistId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const { busy, error, setError, call } = useAction();

  return (
    <>
      <button className="btn btn-sm" onClick={() => setOpen(true)}>
        <Icon name="plus" size={15} /> New rule
      </button>

      {open ? (
        <Overlay
          title="Raise a checklist automatically"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
              <button
                className="btn btn-primary" disabled={busy || !checklistId}
                onClick={() => {
                  if (!checklistId) { setError('Choose a checklist.'); return; }
                  call(
                    () => setChecklistAutomationAction(checklistId, departmentId || null),
                    () => { setOpen(false); setChecklistId(''); setDepartmentId(''); },
                  );
                }}
              >
                {busy ? 'Saving…' : 'Save rule'}
              </button>
            </>
          }
        >
          {error ? <div className="alert" role="alert">{error}</div> : null}

          <Field label="Checklist">
            <select className="select" value={checklistId} onChange={(e) => setChecklistId(e.target.value)}>
              <option value="">Choose a checklist…</option>
              {checklists.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.kind === 'Offboarding' ? 'leaving' : 'joining'})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Applies to" hint="A developer and a teacher rarely sign the same paperwork.">
            <select className="select" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">Everyone added to the workspace</option>
              {departments.map((d) => <option key={d.id} value={d.id}>Only {d.name}</option>)}
            </select>
          </Field>

          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Requests are raised the moment somebody is added, with deadlines worked from
            their start date. People already in the workspace are not affected.
          </p>
        </Overlay>
      ) : null}
    </>
  );
}

/** Removes one rule. Requests already raised are left alone. */
export function RemoveAutomation({ id, label }: { id: string; label: string }) {
  const { busy, call } = useAction();
  return (
    <button
      className="btn btn-sm btn-ghost" disabled={busy} aria-label={`Remove rule: ${label}`}
      onClick={() => {
        if (!window.confirm(`Stop raising ${label} automatically? Requests already raised are kept.`)) return;
        call(() => removeChecklistAutomationAction(id));
      }}
    >
      <Icon name="close" size={15} />
    </button>
  );
}
