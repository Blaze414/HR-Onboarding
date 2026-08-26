'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Department, Profile, Role } from '@snoopy/shared';
import { updateEmployeeAction } from '@/lib/actions';
import { createEmployeeAction } from '@/lib/employee-actions';
import { Field, useAction } from './Interactive';

export function EmployeeForm({
  employee, departments, managers, roles = [], onboardingTemplates = [], checklists = [], courses = [],
}: {
  employee?: Profile;
  departments: Department[];
  managers: Pick<Profile, 'id' | 'name'>[];
  roles?: Role[];
  /** Offered only when adding somebody: their first week, set up in one submit. */
  onboardingTemplates?: { id: string; name: string }[];
  checklists?: { id: string; name: string; kind: string }[];
  courses?: { id: string; title: string }[];
}) {
  const router = useRouter();
  const { busy, error, setError, call } = useAction();
  const [form, setForm] = useState({
    name: employee?.name ?? '',
    email: employee?.email ?? '',
    password: '',
    role: employee?.role ?? 'employee',
    role_id: employee?.role_id ?? roles.find((r) => r.is_system && r.base_role === 'employee')?.id ?? '',
    job_title: employee?.job_title ?? '',
    department_id: employee?.department_id ?? '',
    manager_id: employee?.manager_id ?? '',
    start_date: employee?.start_date ?? '',
    end_date: employee?.end_date ?? '',
    employment_hours: (employee?.employment_hours ?? 'Full-time') as string,
    employment_basis: (employee?.employment_basis ?? 'Ongoing') as string,
    phone: employee?.phone ?? '',
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Their first week. Only shown when adding somebody — an existing person's
  // plans are managed from their own record, where the history is.
  const [firstWeek, setFirstWeek] = useState({
    onboardingTemplateId: '',
    checklistId: '',
    trainingDueInDays: 30,
  });
  const [requiredCourses, setRequiredCourses] = useState<string[]>([]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    await call(
      () => employee
        ? updateEmployeeAction(employee.id, {
            name: form.name,
            role_id: form.role_id || null,
            job_title: form.job_title || null,
            department_id: form.department_id || null,
            manager_id: form.manager_id || null,
            start_date: form.start_date || null,
            end_date: form.end_date || null,
            employment_hours: form.employment_hours,
            employment_basis: form.employment_basis,
            phone: form.phone || null,
          })
        : createEmployeeAction({
            ...(form as any),
            onboardingTemplateId: firstWeek.onboardingTemplateId || undefined,
            checklistId: firstWeek.checklistId || undefined,
            requiredCourseIds: requiredCourses,
            trainingDueInDays: firstWeek.trainingDueInDays,
          }),
      (r) => router.push(employee ? `/employees/${employee.id}` : `/employees/${r.id ?? ''}`),
    );
  }

  return (
    <form onSubmit={submit} noValidate style={{ maxWidth: 660 }}>
      {error ? <div className="alert" role="alert">{error}</div> : null}

      <div className="grid grid-2">
        <Field label="Full name">
          <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Email" hint={employee ? 'Email cannot be changed here.' : 'Used to sign in.'}>
          <input
            className="input" type="email" value={form.email} disabled={!!employee}
            onChange={(e) => set('email', e.target.value)}
          />
        </Field>
      </div>

      {!employee ? (
        <Field label="Temporary password" hint="Share it with the new starter; they can change it later.">
          <input className="input" type="text" value={form.password} onChange={(e) => set('password', e.target.value)} />
        </Field>
      ) : null}

      <div className="grid grid-2">
        <Field label="Job title">
          <input className="input" value={form.job_title ?? ''} onChange={(e) => set('job_title', e.target.value)} />
        </Field>
        <Field label="Role" hint="Roles carry both the security tier and the permissions inside it.">
          <select className="select" value={form.role_id} onChange={(e) => set('role_id', e.target.value)}>
            {roles.length === 0 ? <option value="">No roles defined</option> : null}
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.base_role === 'admin' ? 'Admin tier' : 'Employee tier'}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-2">
        <Field label="Department">
          <select className="select" value={form.department_id ?? ''} onChange={(e) => set('department_id', e.target.value)}>
            <option value="">No department</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Manager">
          <select className="select" value={form.manager_id ?? ''} onChange={(e) => set('manager_id', e.target.value)}>
            <option value="">No manager</option>
            {managers.filter((m) => m.id !== employee?.id).map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-2">
        <Field label="Start date">
          <input className="input" type="date" value={form.start_date ?? ''} onChange={(e) => set('start_date', e.target.value)} />
        </Field>
        <Field label="Phone">
          <input className="input" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
        </Field>
      </div>

      {/*
        * Both halves are required particulars of an employee record under the
        * Fair Work Regulations, and the second one decides what the workspace
        * owes this person afterwards: a casual is owed the Casual Employment
        * Information Statement again and again, and nobody else is. Choosing
        * Casual on one side sets the other, because they cannot disagree —
        * the database refuses the contradiction rather than storing it.
        */}
      <div className="grid grid-2">
        <Field label="Hours" hint="Full-time, part-time or casual.">
          <select
            className="select" value={form.employment_hours}
            onChange={(e) => setForm((f) => ({
              ...f,
              employment_hours: e.target.value,
              employment_basis: e.target.value === 'Casual' ? 'Casual'
                : f.employment_basis === 'Casual' ? 'Ongoing' : f.employment_basis,
            }))}
          >
            {['Full-time', 'Part-time', 'Casual'].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </Field>
        <Field
          label="Basis"
          hint="Ongoing, fixed term, casual or contract. A contractor is not an employee and is owed none of the employee information statements."
        >
          <select
            className="select" value={form.employment_basis}
            onChange={(e) => setForm((f) => ({
              ...f,
              employment_basis: e.target.value,
              employment_hours: e.target.value === 'Casual' ? 'Casual'
                : f.employment_hours === 'Casual' ? 'Full-time' : f.employment_hours,
            }))}
          >
            {['Ongoing', 'Fixed term', 'Casual', 'Contract'].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </Field>
      </div>

      {employee ? (
        <Field label="End date" hint="The day employment ended. Part of the record, so it is kept whether or not the account is still active.">
          <input className="input" type="date" value={form.end_date ?? ''} onChange={(e) => set('end_date', e.target.value)} />
        </Field>
      ) : null}

      {!employee && (onboardingTemplates.length > 0 || checklists.length > 0 || courses.length > 0) ? (
        <section className="first-week">
          <div className="first-week-head">
            <strong>Their first week</strong>
            <span>
              Set up now so nobody has to remember on the day. Every part is optional, and
              anything a department rule already covers is raised automatically anyway.
            </span>
          </div>

          {onboardingTemplates.length > 0 ? (
            <Field label="Onboarding plan">
              <select
                className="select" value={firstWeek.onboardingTemplateId}
                onChange={(e) => setFirstWeek((w) => ({ ...w, onboardingTemplateId: e.target.value }))}
              >
                <option value="">No plan for now</option>
                {onboardingTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
          ) : null}

          {checklists.length > 0 ? (
            <Field label="Documents to ask for" hint="Raised with deadlines counted from their start date.">
              <select
                className="select" value={firstWeek.checklistId}
                onChange={(e) => setFirstWeek((w) => ({ ...w, checklistId: e.target.value }))}
              >
                <option value="">Whatever the department rules cover</option>
                {checklists.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.kind === 'Offboarding' ? ' (leaving)' : ''}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          {courses.length > 0 ? (
            <Field label="Required training" hint="Marked required, so it is chased and reported on.">
              <div className="first-week-courses">
                {courses.slice(0, 12).map((c) => (
                  <label key={c.id} className="first-week-course">
                    <input
                      type="checkbox" className="checkbox"
                      checked={requiredCourses.includes(c.id)}
                      onChange={(e) => setRequiredCourses((list) => (
                        e.target.checked ? [...list, c.id] : list.filter((id) => id !== c.id)
                      ))}
                    />
                    <span>{c.title}</span>
                  </label>
                ))}
              </div>
            </Field>
          ) : null}

          {requiredCourses.length > 0 ? (
            <Field label="Training due within">
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                <input
                  className="input" type="number" min={1} style={{ width: 90 }}
                  value={firstWeek.trainingDueInDays}
                  onChange={(e) => setFirstWeek((w) => ({ ...w, trainingDueInDays: Number(e.target.value) }))}
                  aria-label="Days until required training is due"
                />
                <span className="subtle">days from today</span>
              </div>
            </Field>
          ) : null}
        </section>
      ) : null}

      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : employee ? 'Save changes' : 'Add employee'}
        </button>
        <button type="button" className="btn" onClick={() => router.back()}>Cancel</button>
      </div>
    </form>
  );
}
