'use client';

import { useState } from 'react';
import type { OnboardingTemplate, Profile } from '@snoopy/shared';
import { startOnboardingAction } from '@/lib/actions';
import { Icon } from './Icon';
import { Field, Overlay, useAction } from './Interactive';

export function StartOnboarding({
  employees, templates, presetEmployeeId,
}: {
  employees: Pick<Profile, 'id' | 'name'>[];
  templates: Pick<OnboardingTemplate, 'id' | 'name'>[];
  presetEmployeeId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState(presetEmployeeId ?? '');
  const [templateId, setTemplateId] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [targetDate, setTargetDate] = useState('');
  const { busy, error, setError, call } = useAction();

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)} disabled={templates.length === 0}>
        <Icon name="plus" size={16} /> Start onboarding
      </button>

      {open ? (
        <Overlay
          title="Start onboarding"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
              <button
                className="btn btn-primary" disabled={busy}
                onClick={() => {
                  if (!employeeId || !templateId) { setError('Choose an employee and a template.'); return; }
                  call(
                    () => startOnboardingAction({ employeeId, templateId, startDate, targetDate }),
                    () => setOpen(false),
                  );
                }}
              >
                {busy ? 'Starting…' : 'Start plan'}
              </button>
            </>
          }
        >
          {error ? <div className="alert" role="alert">{error}</div> : null}

          <Field label="Employee">
            <select className="select" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Choose an employee</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>

          <Field label="Template" hint="The template's steps are copied into the plan.">
            <select className="select" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">Choose a template</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>

          <div className="grid grid-2">
            <Field label="Start date">
              <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field label="Target completion">
              <input className="input" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            </Field>
          </div>
        </Overlay>
      ) : null}
    </>
  );
}
