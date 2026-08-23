'use client';

import { useState } from 'react';
import type { Profile } from '@snoopy/shared';
import { updateOwnProfileAction } from '@/lib/actions';
import { Field, useAction } from './Interactive';

export function ProfileForm({ profile }: { profile: Profile }) {
  const { busy, error, call } = useAction();
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    name: profile.name,
    job_title: profile.job_title ?? '',
    phone: profile.phone ?? '',
  });
  const set = (k: string, v: string) => { setForm((f) => ({ ...f, [k]: v })); setSaved(false); };

  return (
    <form
      style={{ maxWidth: 520 }}
      onSubmit={(e) => {
        e.preventDefault();
        call(() => updateOwnProfileAction(form), () => setSaved(true));
      }}
    >
      {error ? <div className="alert" role="alert">{error}</div> : null}
      {saved ? <div className="alert alert-ok" role="status">Profile saved.</div> : null}

      <Field label="Full name">
        <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} />
      </Field>
      <Field label="Job title">
        <input className="input" value={form.job_title} onChange={(e) => set('job_title', e.target.value)} />
      </Field>
      <Field label="Phone">
        <input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
      </Field>

      <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
    </form>
  );
}
