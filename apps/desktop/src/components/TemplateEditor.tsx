'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { STEP_TYPES, type OnboardingTemplate, type StepType } from '@snoopy/shared';
import { saveTemplateAction } from '@/lib/actions';
import { Icon } from './Icon';
import { Field, useAction } from './Interactive';

interface DraftStep {
  key: string;
  title: string;
  description: string;
  type: StepType;
  required: boolean;
}

const newStep = (): DraftStep => ({
  key: Math.random().toString(36).slice(2), title: '', description: '', type: 'Task', required: true,
});

export function TemplateEditor({ template }: { template?: OnboardingTemplate }) {
  const router = useRouter();
  const { busy, error, setError, call } = useAction();
  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [steps, setSteps] = useState<DraftStep[]>(
    template?.steps?.map((s) => ({
      key: s.id, title: s.title, description: s.description ?? '', type: s.type, required: s.required,
    })) ?? [newStep()],
  );
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const patch = (i: number, p: Partial<DraftStep>) =>
    setSteps((s) => s.map((step, idx) => (idx === i ? { ...step, ...p } : step)));

  function move(from: number, to: number) {
    if (to < 0 || to >= steps.length) return;
    setSteps((s) => {
      const next = [...s];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  async function save() {
    setError(null);
    if (name.trim().length < 3) { setNameError('Template name must be at least 3 characters'); return; }
    setNameError(null);
    const filled = steps.filter((s) => s.title.trim().length > 0);
    if (filled.length === 0) { setError('Add at least one step before saving.'); return; }

    await call(
      () => saveTemplateAction({
        id: template?.id,
        name: name.trim(),
        description: description.trim() || undefined,
        steps: filled.map((s) => ({
          title: s.title.trim(), description: s.description.trim() || null, type: s.type, required: s.required,
        })),
      }),
      () => router.push('/onboarding/templates'),
    );
  }

  return (
    <div style={{ maxWidth: 760 }}>
      {error ? <div className="alert" role="alert">{error}</div> : null}

      <Field label="Template name" error={nameError ?? undefined}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Software Developer Onboarding" />
      </Field>

      <Field label="Description" hint="What is this plan for?">
        <textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>

      <h3 style={{ margin: '20px 0 10px' }}>Steps</h3>
      <p className="subtle" style={{ marginBottom: 12 }}>
        Drag a step to reorder it, or use the arrows. Order is what the new starter sees.
      </p>

      <div className="step-list">
        {steps.map((step, index) => (
          <div
            key={step.key}
            className={`step${dragIndex === index ? ' dragging' : ''}`}
            style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragEnd={() => setDragIndex(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragIndex !== null) move(dragIndex, index); setDragIndex(null); }}
          >
            <span className="drag" aria-hidden><Icon name="drag" size={16} /></span>
            <span className="order">{index + 1}</span>

            <div style={{ flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                className="input" value={step.title} placeholder="Step title"
                onChange={(e) => patch(index, { title: e.target.value })}
                aria-label={`Step ${index + 1} title`}
              />
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <select
                  className="select" value={step.type} aria-label={`Step ${index + 1} type`}
                  onChange={(e) => patch(index, { type: e.target.value as StepType })}
                >
                  {STEP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <label className="row" style={{ cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="checkbox" className="checkbox" checked={step.required}
                    onChange={(e) => patch(index, { required: e.target.checked })}
                  />
                  Required
                </label>
                <span className="spacer" style={{ flex: 1 }} />
                <button className="btn btn-sm btn-ghost" onClick={() => move(index, index - 1)} aria-label="Move up">↑</button>
                <button className="btn btn-sm btn-ghost" onClick={() => move(index, index + 1)} aria-label="Move down">↓</button>
                <button
                  className="btn btn-sm btn-danger" aria-label="Remove step"
                  onClick={() => setSteps((s) => s.filter((_, i) => i !== index))}
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn" onClick={() => setSteps((s) => [...s, newStep()])}>
          <Icon name="plus" size={15} /> Add step
        </button>
        <span style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save template'}
        </button>
      </div>
    </div>
  );
}
