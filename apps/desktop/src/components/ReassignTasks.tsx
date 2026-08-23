'use client';

import { useState } from 'react';
import { reassignTasksAction } from '@/lib/actions';
import { Field, Overlay, useAction } from './Interactive';

/** Moves every unfinished task from one person to another, in one step. */
export function ReassignTasks({
  employeeId, employeeName, candidates,
}: { employeeId: string; employeeName: string; candidates: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState('');
  const { busy, error, setError, call } = useAction();

  return (
    <>
      <button className="btn btn-sm btn-primary" onClick={() => setOpen(true)}>Reassign tasks</button>

      {open ? (
        <Overlay
          title={`Reassign ${employeeName}'s tasks`}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
              <button
                className="btn btn-primary" disabled={busy || !to}
                onClick={() => {
                  if (!to) { setError('Choose who picks this up.'); return; }
                  call(() => reassignTasksAction(employeeId, to), () => setOpen(false));
                }}
              >
                {busy ? 'Moving…' : 'Move tasks'}
              </button>
            </>
          }
        >
          {error ? <div className="alert" role="alert">{error}</div> : null}
          <Field label="Hand over to" hint="Every unfinished task moves across. Completed work stays as it is.">
            <select className="select" value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">Choose someone…</option>
              {candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </Overlay>
      ) : null}
    </>
  );
}
