'use client';

import { useState } from 'react';
import { formatDate, formatRelativeTime, type EmployeeCredential } from '@snoopy/shared';
import { reviewCredentialAction } from '@/lib/actions';
import { getBrowserSupabase } from '@/lib/supabase-browser';
import { Icon } from './Icon';
import { Field, Overlay, useAction } from './Interactive';

/**
 * Checking a credential somebody offered.
 *
 * The method is required rather than optional: "Verified" with no account of
 * how is an unfalsifiable claim, and it is the first thing questioned when a
 * placement is challenged. The guidance for the kind is shown right here so the
 * checker is not relying on remembering what to look at.
 */
export function CredentialReview({ credential }: { credential: EmployeeCredential }) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState('');
  const [originalSighted, setOriginalSighted] = useState(false);
  const [note, setNote] = useState('');
  const { busy, error, setError, call } = useAction();

  const METHODS = [
    'Original sighted',
    'Checked against the issuing register',
    'Copy or photograph only',
  ];

  async function openFile() {
    if (!credential.document?.storage_path) return;
    const db = getBrowserSupabase();
    const { data } = await db.storage.from('documents').createSignedUrl(credential.document.storage_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
  }

  return (
    <>
      <button className="btn btn-sm btn-primary" onClick={() => setOpen(true)}>Check</button>

      {open ? (
        <Overlay
          title={credential.title}
          onClose={() => setOpen(false)}
          wide
          footer={
            <>
              <button
                className="btn btn-danger" style={{ marginRight: 'auto' }} disabled={busy} aria-busy={busy}
                onClick={() => {
                  if (!note.trim()) { setError('Say why it was not accepted.'); return; }
                  call(
                    () => reviewCredentialAction({ id: credential.id, accepted: false, note }),
                    () => setOpen(false),
                    { confirmation: 'Not accepted. They have been told why.' },
                  );
                }}
              >
                Not accepted
              </button>
              <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
              <button
                className="btn btn-primary" disabled={busy} aria-busy={busy}
                onClick={() => {
                  if (!method) { setError('Record how you checked it.'); return; }
                  call(
                    () => reviewCredentialAction({
                      id: credential.id, accepted: true, method, originalSighted, note,
                    }),
                    () => setOpen(false),
                    { confirmation: 'Checked. It now counts towards cover.' },
                  );
                }}
              >
                {busy ? 'Saving…' : 'Accept'}
              </button>
            </>
          }
        >
          {error ? <div className="alert" role="alert">{error}</div> : null}

          {credential.type?.verification_guidance ? (
            <div className="alert alert-info">{credential.type.verification_guidance}</div>
          ) : null}

          {credential.verified_at ? (
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              Last decided {formatRelativeTime(credential.verified_at)}
              {credential.verifier?.name ? ` by ${credential.verifier.name}` : ''}
              {credential.verification_method ? ` — ${credential.verification_method.toLowerCase()}` : ''}.
            </p>
          ) : null}

          <dl className="dl">
            <dt>Person</dt><dd>{credential.employee?.name ?? '—'}</dd>
            <dt>Kind</dt><dd>{credential.type?.name ?? 'Not categorised'}</dd>
            <dt>Issued by</dt><dd>{credential.issuer ?? '—'}</dd>
            <dt>Reference</dt><dd>{credential.reference_number ?? '—'}</dd>
            <dt>Where issued</dt><dd>{credential.jurisdiction ?? '—'}</dd>
            <dt>Issued on</dt><dd>{credential.issued_on ? formatDate(credential.issued_on) : '—'}</dd>
            <dt>Expires</dt><dd>{credential.expires_on ? formatDate(credential.expires_on) : 'No expiry'}</dd>
            {credential.conditions ? (<><dt>Conditions</dt><dd>{credential.conditions}</dd></>) : null}
          </dl>

          {credential.document ? (
            <button className="btn btn-sm" onClick={openFile} style={{ marginBottom: 14 }}>
              <Icon name="download" size={15} /> Open the certificate
            </button>
          ) : (
            <p className="muted" style={{ fontSize: 13 }}>
              No scan was attached, so there is nothing here to look at.
            </p>
          )}

          <Field label="How did you check it?" hint="Recorded against the credential, so the check can be traced later.">
            <select className="select" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">Choose…</option>
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>

          <label className="row" style={{ gap: 8, marginBottom: 14 }}>
            <input
              type="checkbox" className="checkbox" checked={originalSighted}
              onChange={(e) => setOriginalSighted(e.target.checked)}
            />
            <span style={{ fontSize: 13.5 }}>I saw the original, not a copy</span>
          </label>

          <Field label="Note" hint="Required if you are not accepting it.">
            <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="The number does not match the register." />
          </Field>
        </Overlay>
      ) : null}
    </>
  );
}
