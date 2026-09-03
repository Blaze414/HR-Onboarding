'use client';

import { documentService, friendlyError, type DocumentRecord } from '@snoopy/shared';
import { useState } from 'react';
import { deleteDocumentAction } from '@/lib/actions';
import { getBrowserSupabase } from '@/lib/supabase-browser';
import { DocumentPreview } from './DocumentPreview';
import { Icon } from './Icon';
import { useAction } from './Interactive';

export function DocumentActions({ doc, canDelete }: { doc: DocumentRecord; canDelete: boolean }) {
  const { busy, error, call } = useAction();
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  async function download() {
    setDownloadError(null);
    try {
      const url = await documentService.getDownloadUrl(getBrowserSupabase(), doc.storage_path, 60, doc.id);
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      setDownloadError(friendlyError(e));
    }
  }

  return (
    <div className="row" style={{ justifyContent: 'flex-end' }}>
      <button className="btn btn-sm" onClick={() => setPreviewing(true)}><Icon name="search" size={15} /> Preview</button>
      <button className="btn btn-sm" onClick={download}><Icon name="download" size={15} /> Open</button>
      {canDelete && documentService.isRetainedRecord(doc) ? (
        <span className="subtle" title={`Kept until ${doc.retain_until}`}>
          Record — kept until {doc.retain_until}
        </span>
      ) : null}
      {canDelete && !documentService.isRetainedRecord(doc) ? (
        <button
          className="btn btn-sm btn-danger" disabled={busy} aria-busy={busy}
          onClick={() => {
            if (!window.confirm(`Delete "${doc.name}"? The file is removed from storage too.`)) return;
            call(() => deleteDocumentAction(doc.id));
          }}
        >
          <Icon name="trash" size={15} />
        </button>
      ) : null}
      {(error || downloadError) ? <span className="error" role="alert">{error ?? downloadError}</span> : null}
      {previewing ? <DocumentPreview doc={doc} onClose={() => setPreviewing(false)} /> : null}
    </div>
  );
}
