'use client';

import { useState } from 'react';
import type { Department, Profile } from '@snoopy/shared';
import { deleteDepartmentAction, saveDepartmentAction } from '@/lib/actions';
import { Icon } from './Icon';
import { Field, Overlay, useAction } from './Interactive';

export function DepartmentEditor({
  department, managers,
}: { department?: Department; managers: Pick<Profile, 'id' | 'name'>[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(department?.name ?? '');
  const [description, setDescription] = useState(department?.description ?? '');
  const [managerId, setManagerId] = useState(department?.manager_id ?? '');
  const { busy, error, setError, call } = useAction();

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        {department ? <>Edit department</> : <><Icon name="plus" size={16} /> New department</>}
      </button>

      {open ? (
        <Overlay
          title={department ? 'Edit department' : 'New department'}
          onClose={() => setOpen(false)}
          footer={
            <>
              {department ? (
                <button
                  className="btn btn-danger" style={{ marginRight: 'auto' }} disabled={busy}
                  onClick={() => {
                    if (!window.confirm('Delete this department? Employees keep their records but lose the grouping.')) return;
                    call(() => deleteDepartmentAction(department.id), () => setOpen(false));
                  }}
                >
                  Delete
                </button>
              ) : null}
              <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
              <button
                className="btn btn-primary" disabled={busy}
                onClick={() => {
                  if (name.trim().length < 2) { setError('Department name is required.'); return; }
                  call(
                    () => saveDepartmentAction({
                      id: department?.id, name: name.trim(),
                      description: description.trim() || undefined,
                      manager_id: managerId || null,
                    }),
                    () => setOpen(false),
                  );
                }}
              >
                {busy ? 'Saving…' : 'Save department'}
              </button>
            </>
          }
        >
          {error ? <div className="alert" role="alert">{error}</div> : null}

          <Field label="Name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Description" hint="Optional">
            <textarea className="input" value={description ?? ''} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="Manager">
            <select className="select" value={managerId ?? ''} onChange={(e) => setManagerId(e.target.value)}>
              <option value="">No manager</option>
              {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
        </Overlay>
      ) : null}
    </>
  );
}
