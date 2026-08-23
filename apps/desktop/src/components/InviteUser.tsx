'use client';

import { useState } from 'react';
import type { Department, Profile, Role } from '@snoopy/shared';
import { inviteEmployeeAction } from '@/lib/employee-actions';
import { Icon } from './Icon';
import { Field, Overlay, useAction } from './Interactive';

export function InviteUser({
  roles, departments, managers,
}: {
  roles: Role[];
  departments: Department[];
  managers: Pick<Profile, 'id' | 'name'>[];
}) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', roleId: roles.find((r) => r.is_system && r.base_role === 'employee')?.id ?? '',
    job_title: '', department_id: '', manager_id: '', start_date: '',
  });
  const { busy, error, call } = useAction();
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>
        <Icon name="plus" size={16} /> Invite user
      </button>

      {open ? (
        <Overlay
          title="Invite a user"
          onClose={() => { setOpen(false); setSent(false); }}
          footer={
            <>
              <button className="btn" onClick={() => { setOpen(false); setSent(false); }}>Close</button>
              <button
                className="btn btn-primary" disabled={busy || sent}
                onClick={() => call(() => inviteEmployeeAction(form), () => setSent(true))}
              >
                {sent ? 'Invitation sent' : busy ? 'Sending…' : 'Send invitation'}
              </button>
            </>
          }
        >
          {error ? <div className="alert" role="alert">{error}</div> : null}
          {sent ? (
            <div className="alert alert-ok" role="status">
              Invitation sent to {form.email}. They set their own password from the email.
            </div>
          ) : null}

          <div className="grid grid-2">
            <Field label="Full name">
              <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="Email">
              <input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            </Field>
          </div>

          <Field label="Role" hint="Decides what they can reach once they accept.">
            <select className="select" value={form.roleId} onChange={(e) => set('roleId', e.target.value)}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name} · {r.base_role === 'admin' ? 'Admin tier' : 'Employee tier'}</option>
              ))}
            </select>
          </Field>

          <div className="grid grid-2">
            <Field label="Job title">
              <input className="input" value={form.job_title} onChange={(e) => set('job_title', e.target.value)} />
            </Field>
            <Field label="Department">
              <select className="select" value={form.department_id} onChange={(e) => set('department_id', e.target.value)}>
                <option value="">No department</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-2">
            <Field label="Manager">
              <select className="select" value={form.manager_id} onChange={(e) => set('manager_id', e.target.value)}>
                <option value="">No manager</option>
                {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
            <Field label="Start date">
              <input className="input" type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
            </Field>
          </div>
        </Overlay>
      ) : null}
    </>
  );
}
