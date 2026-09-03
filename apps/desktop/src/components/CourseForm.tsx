'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { COURSE_STATUSES, courseSchema, fieldErrors, type Course } from '@snoopy/shared';
import { createCourseAction, updateCourseAction } from '@/lib/actions';
import { Field, useAction } from './Interactive';

export function CourseForm({ course }: { course?: Course }) {
  const router = useRouter();
  const { busy, error, setError, call } = useAction();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    title: course?.title ?? '',
    description: course?.description ?? '',
    status: course?.status ?? 'Pending',
    start_date: course?.start_date ?? '',
    end_date: course?.end_date ?? '',
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = courseSchema.safeParse({
      ...form,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    });
    if (!parsed.success) { setErrors(fieldErrors(parsed.error)); return; }
    setErrors({});

    await call(
      () => (course ? updateCourseAction(course.id, form) : createCourseAction(form as any)),
      (r) => router.push(course ? `/courses/${course.id}` : `/courses/${r.id ?? ''}`),
    );
  }

  return (
    <form onSubmit={submit} noValidate style={{ maxWidth: 640 }}>
      {error ? <div className="alert" role="alert">{error}</div> : null}

      <Field label="Course title" error={errors.title}>
        <input className="input" value={form.title} onChange={(e) => set('title', e.target.value)} />
      </Field>

      <Field label="Description" error={errors.description} hint="What will learners cover?">
        <textarea className="input" value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} />
      </Field>

      <div className="grid grid-3">
        <Field label="Status" error={errors.status}>
          <select className="select" value={form.status} onChange={(e) => set('status', e.target.value)}>
            {COURSE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Start date" error={errors.start_date}>
          <input className="input" type="date" value={form.start_date ?? ''} onChange={(e) => set('start_date', e.target.value)} />
        </Field>
        <Field label="End date" error={errors.end_date}>
          <input className="input" type="date" value={form.end_date ?? ''} onChange={(e) => set('end_date', e.target.value)} />
        </Field>
      </div>

      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn btn-primary" disabled={busy} aria-busy={busy}>
          {busy ? 'Saving…' : course ? 'Save changes' : 'Create course'}
        </button>
        <button type="button" className="btn" onClick={() => router.back()}>Cancel</button>
      </div>
    </form>
  );
}
