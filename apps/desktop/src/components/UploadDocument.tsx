'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DOCUMENT_CATEGORIES, documentService, friendlyError } from '@snoopy/shared';
import { getBrowserSupabase } from '@/lib/supabase-browser';
import { Icon } from './Icon';
import { Field, Overlay } from './Interactive';

/**
 * Uploads run in the browser so the file never round-trips through the server.
 * Storage policies check the organisation folder against the caller's own
 * profile, so a forged path is rejected by the database, not by this form.
 */
export function UploadDocument({
  organisationId, userId, canUploadShared, canUpload,
}: { organisationId: string; userId: string; canUploadShared: boolean; canUpload: boolean }) {
  // Reading the library and adding to it are separate grants, so a role can be
  // given the first without the second.
  if (!canUpload) return null;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState(DOCUMENT_CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [shared, setShared] = useState(false);

  function reset() {
    setFile(null); setName(''); setDescription(''); setShared(false);
    setError(null); setDone(false); setBusy(false);
  }

  async function upload() {
    if (!file) { setError('Choose a file to upload.'); return; }
    setBusy(true);
    setError(null);
    try {
      await documentService.uploadDocument(getBrowserSupabase(), {
        organisationId,
        ownerId: shared ? null : userId,
        actorId: userId,
        name: name || file.name,
        category,
        description: description || null,
        file,
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
      });
      setDone(true);
      router.refresh();
      setTimeout(() => { setOpen(false); reset(); }, 900);
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  }

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <Icon name="upload" size={16} /> Upload document
      </button>

      {open ? (
        <Overlay
          title="Upload document"
          onClose={() => { setOpen(false); reset(); }}
          footer={
            <>
              <button className="btn" onClick={() => { setOpen(false); reset(); }}>Cancel</button>
              <button className="btn btn-primary" onClick={upload} disabled={busy || done}>
                {done ? 'Uploaded' : busy ? 'Uploading…' : 'Upload'}
              </button>
            </>
          }
        >
          {error ? <div className="alert" role="alert">{error}</div> : null}
          {done ? <div className="alert alert-ok" role="status">Uploaded. Snoopy approves.</div> : null}

          <Field label="File">
            <input
              className="input" type="file"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !name) setName(f.name.replace(/\.[^.]+$/, ''));
              }}
            />
          </Field>

          <Field label="Document name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>

          <Field label="Category">
            <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
              {DOCUMENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>

          <Field label="Description" hint="Optional">
            <textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>

          {canUploadShared ? (
            <label className="row" style={{ cursor: 'pointer' }}>
              <input type="checkbox" className="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
              <span>Share with the whole organisation</span>
            </label>
          ) : null}
        </Overlay>
      ) : null}
    </>
  );
}
