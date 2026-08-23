'use client';

import { useState } from 'react';
import {
  documentRequestService, formatDate, friendlyError, type DocumentRequest,
} from '@snoopy/shared';
import { getBrowserSupabase } from '@/lib/supabase-browser';
import { Icon } from './Icon';

/**
 * What the company has asked this person for.
 *
 * Deliberately the first thing on the documents page when anything is
 * outstanding: this is the only part of the page that is asking something of the
 * reader. Download, sign, return — in that order, in one place, so nobody has to
 * find an email from three weeks ago.
 */
export function DocumentRequests({
  requests, organisationId, employeeId, canSubmit,
}: {
  requests: DocumentRequest[];
  organisationId: string;
  employeeId: string;
  /** Returning a document is its own grant, separate from seeing the request. */
  canSubmit: boolean;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  const open = requests.filter((r) => !['Accepted'].includes(r.status) && !done.has(r.id));
  if (open.length === 0) return null;

  async function download(path: string) {
    const db = getBrowserSupabase();
    const { data, error: failed } = await db.storage.from('documents').createSignedUrl(path, 60);
    if (failed) { setError(friendlyError(failed)); return; }
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
  }

  async function submit(request: DocumentRequest, file: File) {
    setBusyId(request.id);
    setError(null);
    try {
      await documentRequestService.submit(getBrowserSupabase(), {
        requestId: request.id,
        organisationId,
        employeeId,
        file,
        fileName: file.name,
        contentType: file.type,
        title: `${request.title} — returned`,
      });
      setDone((d) => new Set(d).add(request.id));
    } catch (thrown) {
      setError(friendlyError(thrown));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="card requests">
      <div className="card-head">
        <strong>{open.length} {open.length === 1 ? 'document is' : 'documents are'} needed from you</strong>
      </div>

      {error ? <div className="alert" role="alert" style={{ margin: 14 }}>{error}</div> : null}

      <div className="request-list">
        {open.map((request) => {
          const overdue = request.due_date ? new Date(request.due_date) < new Date() : false;
          const returned = request.status === 'Returned';
          const submitted = request.status === 'Submitted';

          return (
            <div key={request.id} className="request">
              <div className="request-text">
                <strong>{request.title}</strong>
                {request.instructions ? <span>{request.instructions}</span> : null}
                {returned && request.review_note ? (
                  <span className="request-note">Sent back: {request.review_note}</span>
                ) : null}
                <span className={`req req-${overdue ? 'overdue' : 'due_soon'}`}>
                  {request.due_date
                    ? overdue ? `Overdue since ${formatDate(request.due_date)}` : `Due ${formatDate(request.due_date)}`
                    : 'No deadline'}
                </span>
              </div>

              <div className="request-actions">
                {request.template ? (
                  <button className="btn btn-sm" onClick={() => download(request.template!.storage_path)}>
                    <Icon name="download" size={15} /> Download
                  </button>
                ) : null}

                {submitted ? (
                  <span className="subtle">Returned — waiting to be checked</span>
                ) : !canSubmit ? (
                  <span className="subtle">Ask your administrator to return this for you.</span>
                ) : (
                  <label className="btn btn-sm btn-primary" style={{ cursor: 'pointer' }}>
                    {busyId === request.id ? 'Uploading…' : returned ? 'Upload again' : 'Upload signed copy'}
                    <input
                      type="file" hidden disabled={busyId === request.id}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void submit(request, file);
                      }}
                    />
                  </label>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
