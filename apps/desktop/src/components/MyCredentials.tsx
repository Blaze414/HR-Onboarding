'use client';

import { useState } from 'react';
import {
  credentialService, formatDate, friendlyError,
  type CredentialType, type EmployeeCredential,
} from '@snoopy/shared';
import { getBrowserSupabase } from '@/lib/supabase-browser';
import { Icon } from './Icon';
import { ApprovedStamp } from './ui';
import { Field, Overlay } from './Interactive';
import { useToast } from './Toast';

/**
 * Qualifications a person offers, unprompted.
 *
 * Nobody asked for these — the reason to record one is that it changes where the
 * person could be rostered, which only holds if the record says what kind of
 * thing it is and when it stops being true. Everything asked for below exists
 * because somebody later has to check it without ringing the person up.
 */
export function MyCredentials({
  credentials, types, organisationId, employeeId, canSubmit,
}: {
  credentials: EmployeeCredential[];
  types: CredentialType[];
  organisationId: string;
  employeeId: string;
  canSubmit: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="card">
      <div className="card-head">
        <strong>Certifications and qualifications</strong>
        {canSubmit ? (
          <button className="btn btn-sm btn-primary" onClick={() => setOpen(true)}>
            <Icon name="plus" size={15} /> Add one
          </button>
        ) : null}
      </div>

      {credentials.length === 0 ? (
        <div style={{ padding: 18 }}>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Nothing recorded. Adding a certificate — first aid, a licence, a language —
            lets your workplace see where else you could help out.
          </p>
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr><th>Credential</th><th>Reference</th><th>Expires</th><th>Status</th></tr>
          </thead>
          <tbody>
            {credentials.map((c) => (
              <tr key={c.id}>
                <td>
                  <span style={{ fontWeight: 560 }}>{c.title}</span>
                  <div className="subtle">
                    {[c.type?.name, c.issuer, c.jurisdiction].filter(Boolean).join(' · ') || 'No issuer recorded'}
                  </div>
                  {c.review_note ? (
                    <div className="subtle">Not accepted: {c.review_note}</div>
                  ) : null}
                </td>
                <td className="subtle">{c.reference_number ?? '—'}</td>
                <td className="subtle nowrap">{c.expires_on ? formatDate(c.expires_on) : 'No expiry'}</td>
                <td>
                  <CredentialStatus credential={c} />
                  <ApprovedStamp
                    at={c.verified_at}
                    by={c.verifier?.name}
                    verb={c.status === 'Rejected' ? 'Reviewed' : 'Checked'}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {open ? (
        <AddCredential
          types={types}
          organisationId={organisationId}
          employeeId={employeeId}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </section>
  );
}

function CredentialStatus({ credential }: { credential: EmployeeCredential }) {
  const lapsed = credential.expires_on ? new Date(credential.expires_on) < new Date() : false;
  if (credential.status === 'Verified' && !lapsed) return <span className="req req-done">Checked</span>;
  if (credential.status === 'Expired' || lapsed) return <span className="req req-overdue">Expired</span>;
  if (credential.status === 'Rejected') return <span className="req req-overdue">Not accepted</span>;
  return <span className="req req-due_soon">Waiting to be checked</span>;
}

function AddCredential({
  types, organisationId, employeeId, onClose,
}: { types: CredentialType[]; organisationId: string; employeeId: string; onClose: () => void }) {
  const [typeId, setTypeId] = useState('');
  const [title, setTitle] = useState('');
  const [issuer, setIssuer] = useState('');
  const [reference, setReference] = useState('');
  const [jurisdiction, setJurisdiction] = useState('');
  const [conditions, setConditions] = useState('');
  const [issuedOn, setIssuedOn] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const chosen = types.find((t) => t.id === typeId);
  const needsExpiry = chosen?.requires_expiry ?? false;

  async function submit() {
    if (title.trim().length < 2) { setError('Give it a name.'); return; }
    if (needsExpiry && !expiresOn) {
      // A certificate whose expiry nobody recorded is treated as current
      // forever, which is the failure this whole record exists to prevent.
      setError(`A ${chosen?.name} has to state when it expires.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await credentialService.submit(getBrowserSupabase(), {
        organisationId, employeeId,
        credentialTypeId: typeId || null,
        title: title.trim(),
        issuer, referenceNumber: reference, jurisdiction, conditions,
        issuedOn: issuedOn || null, expiresOn: expiresOn || null,
        file, fileName: file?.name, contentType: file?.type,
      });
      toast.show('Added. Somebody will check it before it counts.');
      onClose();
      window.location.reload();
    } catch (thrown) {
      setError(friendlyError(thrown));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Overlay
      title="Add a certification"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={submit}>
            {busy ? 'Adding…' : 'Add certification'}
          </button>
        </>
      }
    >
      {error ? <div className="alert" role="alert">{error}</div> : null}

      <Field label="What kind is it?" hint="Choosing a kind is what lets your workplace see which teams you could help.">
        <select
          className="select" value={typeId}
          onChange={(e) => {
            setTypeId(e.target.value);
            const next = types.find((t) => t.id === e.target.value);
            if (next && !title) setTitle(next.name);
          }}
        >
          <option value="">Something else</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </Field>

      {chosen?.description ? (
        <p className="muted" style={{ marginTop: -6, fontSize: 12.5 }}>{chosen.description}</p>
      ) : null}

      <Field label="Name on the certificate">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>

      <div className="grid grid-2">
        <Field label="Issued by">
          <input className="input" value={issuer} onChange={(e) => setIssuer(e.target.value)}
            placeholder="St John, Service NSW…" />
        </Field>
        <Field label="Reference number" hint="So it can be checked against the issuer.">
          <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
      </div>

      <div className="grid grid-2">
        <Field label="Where it was issued" hint="A licence is not always valid elsewhere.">
          <input className="input" value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)}
            placeholder="New South Wales" />
        </Field>
        <Field label="Issued on">
          <input className="input" type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
        </Field>
      </div>

      <Field
        label={needsExpiry ? 'Expires on' : 'Expires on (if it does)'}
        hint={needsExpiry ? 'Required for this kind.' : 'Leave blank if it does not expire.'}
      >
        <input className="input" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
      </Field>

      <Field label="Any conditions on it" hint="Class restrictions, supervision requirements, corrective lenses.">
        <textarea className="input" value={conditions} onChange={(e) => setConditions(e.target.value)} />
      </Field>

      <Field label="Photo or scan" hint="Whoever checks it needs to see the certificate itself.">
        <input className="input" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </Field>
    </Overlay>
  );
}
