'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  fieldErrors, TASK_PRIORITIES, TASK_STATUSES, taskSchema, type Course, type Profile, type Task,
} from '@snoopy/shared';
import { createTaskAction, updateTaskAction } from '@/lib/actions';
import { Field, useAction } from './Interactive';

export function TaskForm({
  task, employees, courses,
}: { task?: Task; employees: Pick<Profile, 'id' | 'name'>[]; courses: Pick<Course, 'id' | 'title'>[] }) {
  const router = useRouter();
  const { busy, error, setError, call } = useAction();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    title: task?.title ?? '',
    description: task?.description ?? '',
    assigned_to: task?.assigned_to ?? '',
    course_id: task?.course_id ?? '',
    status: task?.status ?? 'Pending',
    priority: task?.priority ?? 'Medium',
    due_date: task?.due_date ?? '',
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = taskSchema.safeParse({
      ...form,
      assigned_to: form.assigned_to || null,
      course_id: form.course_id || null,
      due_date: form.due_date || null,
    });
    if (!parsed.success) { setErrors(fieldErrors(parsed.error)); return; }
    setErrors({});
    await call(
      () => (task ? updateTaskAction(task.id, parsed.data) : createTaskAction(parsed.data)),
      () => router.push('/tasks'),
    );
  }

  return (
    <form onSubmit={submit} noValidate style={{ maxWidth: 660 }}>
      {error ? <div className="alert" role="alert">{error}</div> : null}

      <Field label="Task title" error={errors.title}>
        <input className="input" value={form.title} onChange={(e) => set('title', e.target.value)} />
      </Field>

      <Field label="Description" error={errors.description}>
        <textarea className="input" value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} />
      </Field>

      <div className="grid grid-2">
        <Field label="Responsible" error={errors.assigned_to}>
          <select className="select" value={form.assigned_to ?? ''} onChange={(e) => set('assigned_to', e.target.value)}>
            <option value="">Nobody yet</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </Field>
        <Field label="Related course" error={errors.course_id} hint="Optional">
          <select className="select" value={form.course_id ?? ''} onChange={(e) => set('course_id', e.target.value)}>
            <option value="">No course</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </Field>
      </div>

      <div className="grid grid-3">
        <Field label="Status" error={errors.status}>
          <select className="select" value={form.status} onChange={(e) => set('status', e.target.value)}>
            {TASK_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Priority" error={errors.priority}>
          <select className="select" value={form.priority} onChange={(e) => set('priority', e.target.value)}>
            {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Due date" error={errors.due_date}>
          <input className="input" type="date" value={form.due_date ?? ''} onChange={(e) => set('due_date', e.target.value)} />
        </Field>
      </div>

      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : task ? 'Save changes' : 'Create task'}
        </button>
        <button type="button" className="btn" onClick={() => router.back()}>Cancel</button>
      </div>
    </form>
  );
}
