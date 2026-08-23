'use client';

import { useState } from 'react';
import type { PlanKind } from '@snoopy/shared';
import { deleteChecklistAction, saveChecklistAction } from '@/lib/actions';
import { Icon } from './Icon';
import { Field, Overlay, useAction } from './Interactive';

interface Item {
  title: string;
  instructions?: string;
  templateDocumentId?: string | null;
  dueAfterDays: number;
}

/**
 * Authoring a checklist.
 *
 * The whole list is edited at once, because that is how somebody thinks about
 * it — "the new starter pack" is one thing, not seven records. Deadlines are
 * days from the person's start date rather than dates, so the same pack serves
 * every starter without being edited.
 */
export function ChecklistEditor({
  checklist, templates, trigger,
}: {
  checklist?: { id: string; name: string; description: string | null; kind: PlanKind; items: any[] };
  templates: { id: string; name: string }[];
  trigger?: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(checklist?.name ?? '');
  const [description, setDescription] = useState(checklist?.description ?? '');
  const [kind, setKind] = useState<PlanKind>(checklist?.kind ?? 'Onboarding');
  const [items, setItems] = useState<Item[]>(
    checklist?.items?.length
      ? [...checklist.items]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((i) => ({
            title: i.title,
            instructions: i.instructions ?? '',
            templateDocumentId: i.template_document_id,
            dueAfterDays: i.due_after_days,
          }))
      : [{ title: '', instructions: '', templateDocumentId: null, dueAfterDays: 7 }],
  );
  const { busy, error, setError, call } = useAction();

  const update = (index: number, patch: Partial<Item>) =>
    setItems((list) => list.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  return (
    <>
      <button className={`btn btn-sm${trigger ? '' : ' btn-primary'}`} onClick={() => setOpen(true)}>
        {trigger ?? <><Icon name="plus" size={15} /> New checklist</>}
      </button>

      {open ? (
        <Overlay
          title={checklist ? `Edit ${checklist.name}` : 'New checklist'}
          onClose={() => setOpen(false)}
          wide
          footer={
            <>
              {checklist ? (
                <button
                  className="btn btn-danger" style={{ marginRight: 'auto' }} disabled={busy}
                  onClick={() => {
                    if (!window.confirm(`Delete "${checklist.name}"? Requests already raised are kept.`)) return;
                    call(() => deleteChecklistAction(checklist.id), () => setOpen(false));
                  }}
                >
                  Delete
                </button>
              ) : null}
              <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
              <button
                className="btn btn-primary" disabled={busy}
                onClick={() => {
                  if (name.trim().length < 2) { setError('Give the checklist a name.'); return; }
                  call(
                    () => saveChecklistAction({ id: checklist?.id, name, description, kind, items }),
                    () => setOpen(false),
                  );
                }}
              >
                {busy ? 'Saving…' : 'Save checklist'}
              </button>
            </>
          }
        >
          {error ? <div className="alert" role="alert">{error}</div> : null}

          <Field label="Name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="New Starter Pack" />
          </Field>

          <Field label="Description" hint="What this pack is for.">
            <textarea className="input" value={description ?? ''} onChange={(e) => setDescription(e.target.value)} />
          </Field>

          <Field label="Used for" hint="Joining and leaving need different paperwork.">
            <select className="select" value={kind} onChange={(e) => setKind(e.target.value as PlanKind)}>
              <option value="Onboarding">Joining</option>
              <option value="Offboarding">Leaving</option>
            </select>
          </Field>

          <div className="row-between" style={{ margin: '18px 0 8px' }}>
            <h3>Documents</h3>
            <span className="subtle">{items.length} on this checklist</span>
          </div>

          <div className="checklist-items">
            {items.map((item, index) => (
              <div key={index} className="checklist-item">
                <div className="checklist-item-main">
                  <input
                    className="input" value={item.title} placeholder="Signed employment contract"
                    onChange={(e) => update(index, { title: e.target.value })}
                    aria-label={`Document ${index + 1} title`}
                  />
                  <input
                    className="input" value={item.instructions ?? ''} placeholder="What the person has to do"
                    onChange={(e) => update(index, { instructions: e.target.value })}
                    aria-label={`Document ${index + 1} instructions`}
                  />
                </div>

                <label className="checklist-item-days">
                  <span className="subtle">Due</span>
                  <input
                    className="input" type="number" min={0} value={item.dueAfterDays}
                    onChange={(e) => update(index, { dueAfterDays: Number(e.target.value) })}
                    aria-label={`Document ${index + 1} days after start`}
                  />
                  <span className="subtle">days in</span>
                </label>

                <label className="checklist-item-file">
                  <span className="subtle">To sign</span>
                  <select
                    className="select" value={item.templateDocumentId ?? ''}
                    onChange={(e) => update(index, { templateDocumentId: e.target.value || null })}
                    aria-label={`Document ${index + 1} file to sign`}
                  >
                    <option value="">Nothing to download</option>
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>

                <button
                  className="btn btn-sm btn-ghost" aria-label={`Remove document ${index + 1}`}
                  onClick={() => setItems((list) => list.filter((_, i) => i !== index))}
                >
                  <Icon name="close" size={15} />
                </button>
              </div>
            ))}
          </div>

          <button
            className="btn btn-sm" style={{ marginTop: 10 }}
            onClick={() => setItems((list) => [...list, { title: '', instructions: '', templateDocumentId: null, dueAfterDays: 7 }])}
          >
            <Icon name="plus" size={15} /> Add document
          </button>
        </Overlay>
      ) : null}
    </>
  );
}
