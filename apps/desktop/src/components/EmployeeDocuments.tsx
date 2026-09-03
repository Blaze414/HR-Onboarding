'use client';

import { useState } from 'react';
import { formatDate, type DocumentRequest } from '@snoopy/shared';
import {
  applyChecklistAction, requestDocumentAction, reviewDocumentRequestAction,
  saveChecklistFromEmployeeAction,
} from '@/lib/actions';
import { getBrowserSupabase } from '@/lib/supabase-browser';
import { Icon } from './Icon';
import { Field, Overlay, useAction } from './Interactive';
import { ApprovedStamp } from './ui';

/**
 * One person's paperwork, from the HR side.
 *
 * Everything that happens to a document request happens here — ask for it, chase
 * it, read what came back, accept or return it — because chasing paperwork is
 * one task, and splitting it across screens is how items get forgotten.
 */
export function EmployeeDocuments({
  employeeId, employeeName, requests, checklists, sharedDocuments,
}: {
  employeeId: string;
  employeeName: string;
  requests: DocumentRequest[];
  checklists: { id: string; name: string; kind: string }[];
  sharedDocuments: { id: string; name: string }[];
}) {
  const outstanding = requests.filter((r) => r.status !== 'Accepted');
  const submitted = requests.filter((r) => r.status === 'Submitted');

  return (
    <section className="card">
      <div className="card-head">
        <strong>
          Documents
          {submitted.length > 0 ? ` · ${submitted.length} waiting on you` : null}
        </strong>
        <div className="row" style={{ gap: 8 }}>
          <ApplyChecklist employeeId={employeeId} employeeName={employeeName} checklists={checklists} />
          <SaveAsChecklist employeeId={employeeId} disabled={requests.length === 0} />
          <RequestDocument employeeId={employeeId} sharedDocuments={sharedDocuments} />
        </div>
      </div>

      {requests.length === 0 ? (
        <div style={{ padding: 18 }}>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Nothing has been asked of {employeeName.split(' ')[0]} yet. Apply a checklist to raise a
            whole pack at once.
          </p>
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr><th>Document</th><th>Due</th><th>Status</th><th>Returned</th><th /></tr>
          </thead>
          <tbody>
            {requests.map((request) => (
              <tr key={request.id}>
                <td>
                  <span style={{ fontWeight: 560 }}>{request.title}</span>
                  {request.review_note ? (
                    <div className="subtle truncate" style={{ maxWidth: 320 }}>Sent back: {request.review_note}</div>
                  ) : null}
                </td>
                <td className="subtle nowrap">{request.due_date ? formatDate(request.due_date) : '—'}</td>
                <td>
                  <RequestStatus status={request.status} dueDate={request.due_date} />
                  <ApprovedStamp
                    at={request.reviewed_at}
                    by={request.reviewer?.name}
                    verb={request.status === 'Returned' ? 'Sent back' : 'Accepted'}
                  />
                </td>
                <td>
                  {request.submitted ? (
                    <DownloadReturned path={request.submitted.storage_path} name={request.submitted.name} />
                  ) : <span className="subtle">—</span>}
                </td>
                <td className="actions">
                  {request.status === 'Submitted' ? <ReviewRequest request={request} /> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {outstanding.length > 0 ? (
        <div className="card-foot subtle">
          {outstanding.length} still outstanding.
        </div>
      ) : null}
    </section>
  );
}

/** Late is a different fact from outstanding, so it reads differently. */
function RequestStatus({ status, dueDate }: { status: string; dueDate: string | null }) {
  const overdue = status !== 'Accepted' && dueDate ? new Date(dueDate) < new Date() : false;
  if (status === 'Accepted') return <span className="req req-done">Accepted</span>;
  if (status === 'Submitted') return <span className="req req-upcoming">Returned</span>;
  if (status === 'Returned') return <span className="req req-overdue">Sent back</span>;
  return <span className={`req req-${overdue ? 'overdue' : 'due_soon'}`}>{overdue ? 'Overdue' : 'Requested'}</span>;
}

function DownloadReturned({ path, name }: { path: string; name: string }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        className="btn btn-sm"
        onClick={async () => {
          const db = getBrowserSupabase();
          const { data, error: failed } = await db.storage.from('documents').createSignedUrl(path, 60);
          if (failed) { setError('Could not open that file.'); return; }
          if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
        }}
      >
        <Icon name="download" size={15} /> {name.length > 24 ? 'Download' : name}
      </button>
      {error ? <span className="subtle">{error}</span> : null}
    </>
  );
}

/** Accept what came back, or send it back saying what is wrong with it. */
function ReviewRequest({ request }: { request: DocumentRequest }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const { busy, error, setError, call } = useAction();

  return (
    <>
      <button className="btn btn-sm btn-primary" onClick={() => setOpen(true)}>Review</button>

      {open ? (
        <Overlay
          title={request.title}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button
                className="btn btn-danger" style={{ marginRight: 'auto' }} disabled={busy} aria-busy={busy}
                onClick={() => {
                  if (!note.trim()) { setError('Say what needs correcting before sending it back.'); return; }
                  call(() => reviewDocumentRequestAction(request.id, false, note), () => setOpen(false));
                }}
              >
                Send back
              </button>
              <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
              <button
                className="btn btn-primary" disabled={busy} aria-busy={busy}
                onClick={() => call(() => reviewDocumentRequestAction(request.id, true), () => setOpen(false))}
              >
                {busy ? 'Saving…' : 'Accept'}
              </button>
            </>
          }
        >
          {error ? <div className="alert" role="alert">{error}</div> : null}
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
            Returned {request.submitted_at ? formatDate(request.submitted_at) : 'recently'}.
          </p>
          <Field label="If sending it back, what needs correcting?" hint="Without a reason it comes back wrong a second time.">
            <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Page 3 is unsigned." />
          </Field>
        </Overlay>
      ) : null}
    </>
  );
}

function RequestDocument({
  employeeId, sharedDocuments,
}: { employeeId: string; sharedDocuments: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [templateDocumentId, setTemplateDocumentId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const { busy, error, setError, call } = useAction();

  return (
    <>
      <button className="btn btn-sm btn-primary" onClick={() => setOpen(true)}>
        <Icon name="plus" size={15} /> Request
      </button>

      {open ? (
        <Overlay
          title="Request a document"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
              <button
                className="btn btn-primary" disabled={busy} aria-busy={busy}
                onClick={() => {
                  if (title.trim().length < 2) { setError('Give the request a title.'); return; }
                  call(
                    () => requestDocumentAction({
                      employeeId, title, instructions,
                      templateDocumentId: templateDocumentId || null,
                      dueDate: dueDate || null,
                    }),
                    () => { setOpen(false); setTitle(''); setInstructions(''); setDueDate(''); },
                  );
                }}
              >
                {busy ? 'Requesting…' : 'Send request'}
              </button>
            </>
          }
        >
          {error ? <div className="alert" role="alert">{error}</div> : null}

          <Field label="What do you need?">
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Signed employment contract" />
          </Field>

          <Field label="Instructions" hint="Shown to them next to the request.">
            <textarea className="input" value={instructions} onChange={(e) => setInstructions(e.target.value)}
              placeholder="Download it, sign it, and upload the signed copy." />
          </Field>

          <Field label="File to sign" hint="Optional. Shared documents only.">
            <select className="select" value={templateDocumentId}
              onChange={(e) => setTemplateDocumentId(e.target.value)}>
              <option value="">Nothing to download</option>
              {sharedDocuments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>

          <Field label="Due by">
            <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </Overlay>
      ) : null}
    </>
  );
}

function ApplyChecklist({
  employeeId, employeeName, checklists,
}: { employeeId: string; employeeName: string; checklists: { id: string; name: string; kind: string }[] }) {
  const [open, setOpen] = useState(false);
  const [checklistId, setChecklistId] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const { busy, error, setError, call } = useAction();

  if (checklists.length === 0) return null;

  return (
    <>
      <button className="btn btn-sm" onClick={() => setOpen(true)}>Apply checklist</button>

      {open ? (
        <Overlay
          title={`Apply a checklist to ${employeeName.split(' ')[0]}`}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
              <button
                className="btn btn-primary" disabled={busy || !checklistId} aria-busy={busy}
                onClick={() => {
                  if (!checklistId) { setError('Choose a checklist.'); return; }
                  call(() => applyChecklistAction(checklistId, employeeId, startDate), () => setOpen(false));
                }}
              >
                {busy ? 'Raising…' : 'Raise every request'}
              </button>
            </>
          }
        >
          {error ? <div className="alert" role="alert">{error}</div> : null}

          <Field label="Checklist">
            <select className="select" value={checklistId} onChange={(e) => setChecklistId(e.target.value)}>
              <option value="">Choose a checklist…</option>
              {checklists.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.kind === 'Offboarding' ? 'leaving' : 'joining'})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Deadlines counted from" hint="Usually their start date, or their last day for a leaving pack.">
            <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>

          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Anything already asked for is skipped, so this is safe to run twice.
          </p>
        </Overlay>
      ) : null}
    </>
  );
}

/** Keeps what was asked of this person as a checklist for the next one. */
function SaveAsChecklist({ employeeId, disabled }: { employeeId: string; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'Onboarding' | 'Offboarding'>('Onboarding');
  const { busy, error, setError, call } = useAction();

  if (disabled) return null;

  return (
    <>
      <button className="btn btn-sm" onClick={() => setOpen(true)}>Save as checklist</button>

      {open ? (
        <Overlay
          title="Keep this as a checklist"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
              <button
                className="btn btn-primary" disabled={busy} aria-busy={busy}
                onClick={() => {
                  if (name.trim().length < 2) { setError('Give the checklist a name.'); return; }
                  call(() => saveChecklistFromEmployeeAction(employeeId, name, kind), () => setOpen(false));
                }}
              >
                {busy ? 'Saving…' : 'Save checklist'}
              </button>
            </>
          }
        >
          {error ? <div className="alert" role="alert">{error}</div> : null}
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
            Everything asked of this person becomes a reusable pack, with the same spacing
            between deadlines.
          </p>

          <Field label="Name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="New Starter Pack" />
          </Field>

          <Field label="Used for">
            <select className="select" value={kind} onChange={(e) => setKind(e.target.value as 'Onboarding' | 'Offboarding')}>
              <option value="Onboarding">Joining</option>
              <option value="Offboarding">Leaving</option>
            </select>
          </Field>
        </Overlay>
      ) : null}
    </>
  );
}
