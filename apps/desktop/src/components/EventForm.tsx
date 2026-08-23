'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { eventSchema, fieldErrors, type Profile, type WorkEvent } from '@snoopy/shared';
import { createEventAction, updateEventAction } from '@/lib/actions';
import { Field, useAction } from './Interactive';

const toLocal = (iso: string | null | undefined) =>
  iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';

export function EventForm({
  event, employees, initialParticipants = [], initialDate,
}: {
  event?: WorkEvent;
  employees: Pick<Profile, 'id' | 'name'>[];
  initialParticipants?: string[];
  /** yyyy-mm-dd handed over when the calendar's "Add" button opens this form. */
  initialDate?: string;
}) {
  const router = useRouter();
  const { busy, error, setError, call } = useAction();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [participants, setParticipants] = useState<string[]>(initialParticipants);
  const [form, setForm] = useState({
    title: event?.title ?? '',
    description: event?.description ?? '',
    start_time: event ? toLocal(event.start_time) : initialDate ? `${initialDate}T09:00` : '',
    end_time: toLocal(event?.end_time),
    location: event?.location ?? '',
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = eventSchema.safeParse({ ...form, end_time: form.end_time || null });
    if (!parsed.success) { setErrors(fieldErrors(parsed.error)); return; }
    setErrors({});

    await call(
      () => event
        ? updateEventAction(event.id, {
            ...form,
            start_time: new Date(form.start_time).toISOString(),
            end_time: form.end_time ? new Date(form.end_time).toISOString() : null,
          }, participants)
        : createEventAction({ ...form, participants }),
      (r) => router.push(event ? `/events/${event.id}` : `/events/${r.id ?? ''}`),
    );
  }

  return (
    <form onSubmit={submit} noValidate style={{ maxWidth: 660 }}>
      {error ? <div className="alert" role="alert">{error}</div> : null}

      <Field label="Event title" error={errors.title}>
        <input className="input" value={form.title} onChange={(e) => set('title', e.target.value)} />
      </Field>

      <Field label="Description" error={errors.description}>
        <textarea className="input" value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} />
      </Field>

      <div className="grid grid-2">
        <Field label="Starts" error={errors.start_time}>
          <input className="input" type="datetime-local" value={form.start_time} onChange={(e) => set('start_time', e.target.value)} />
        </Field>
        <Field label="Ends" error={errors.end_time}>
          <input className="input" type="datetime-local" value={form.end_time} onChange={(e) => set('end_time', e.target.value)} />
        </Field>
      </div>

      <Field label="Location" error={errors.location}>
        <input className="input" value={form.location ?? ''} onChange={(e) => set('location', e.target.value)} />
      </Field>

      <Field label="Participants" hint="Invited people can respond from the mobile app or here.">
        <div className="step-list" style={{ maxHeight: 220, overflowY: 'auto' }}>
          {employees.map((e) => (
            <label key={e.id} className="step" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox" className="checkbox" checked={participants.includes(e.id)}
                onChange={(ev) =>
                  setParticipants((p) => (ev.target.checked ? [...p, e.id] : p.filter((id) => id !== e.id)))
                }
              />
              <span className="title">{e.name}</span>
            </label>
          ))}
        </div>
      </Field>

      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : event ? 'Save changes' : 'Create event'}
        </button>
        <button type="button" className="btn" onClick={() => router.back()}>Cancel</button>
      </div>
    </form>
  );
}
