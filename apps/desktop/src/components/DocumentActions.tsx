'use client';

import { documentService, friendlyError, type DocumentRecord } from '@snoopy/shared';
import { useState } from 'react';
import { deleteDocumentAction } from '@/lib/actions';
import { getBrowserSupabase } from '@/lib/supabase-browser';
import { Icon } from './Icon';
import { useAction } from './Interactive';

export function DocumentActions({ doc, canDelete }: { doc: DocumentRecord; canDelete: boolean }) {
  const { busy, error, call } = useAction();
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function download() {
    setDownloadError(null);
    try {
      const url = await documentService.getDownloadUrl(getBrowserSupabase(), doc.storage_path);
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      setDownloadError(friendlyError(e));
    }
  }

  return (
    <div className="row" style={{ justifyContent: 'flex-end' }}>
      <button className="btn btn-sm" onClick={download}><Icon name="download" size={15} /> Open</button>
      {canDelete ? (
        <button
          className="btn btn-sm btn-danger" disabled={busy}
          onClick={() => {
            if (!window.confirm(`Delete "${doc.name}"? The file is removed from storage too.`)) return;
            call(() => deleteDocumentAction(doc.id));
          }}
        >
          <Icon name="trash" size={15} />
        </button>
      ) : null}
      {(error || downloadError) ? <span className="error" role="alert">{error ?? downloadError}</span> : null}
    </div>
  );
}
