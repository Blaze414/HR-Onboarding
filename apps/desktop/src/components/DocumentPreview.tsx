'use client';

import { documentService, friendlyError, type DocumentRecord } from '@snoopy/shared';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { getBrowserSupabase } from '@/lib/supabase-browser';
import { Overlay } from './Interactive';

/*
 * The viewer pulls in the whole renderer matrix — office, PDF, CAD, archives —
 * and reaches for the DOM as it mounts. It is loaded only once somebody asks to
 * see a file, and never on the server, so the pages that merely *list*
 * documents stay as light as they were.
 */
const FileViewer = dynamic(
  () => Promise.all([
    import('@file-viewer/react-full'),
    /*
     * Side-effect only: this module sets `globalThis.pdfjsWorker` when it
     * runs. PDF.js checks that global *before* ever falling back to its own
     * `import(workerSrc)` of a plain URL string — a runtime ES-module-from-URL
     * fetch that has proven unreliable here ("Setting up fake worker failed:
     * Invalid or unexpected token", intermittent even against a correct
     * build). Importing it here instead is a normal webpack-bundled chunk —
     * ordinary script loading, none of that fragility — so by the time
     * FileViewer looks for a worker, one is already sitting on the global and
     * the risky path is never taken at all.
     */
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs'),
  ]).then(([m]) => m.FileViewer),
  { ssr: false, loading: () => <p className="muted">Opening…</p> },
);

/*
 * The viewer picks its renderer from the extension, not from the MIME type on
 * the row, so it is handed the stored file name — the display name is what a
 * person typed and often has no extension at all.
 */
const extensionHint = (storagePath: string) => storagePath.split('/').pop() ?? storagePath;

/*
 * The viewer draws its own toolbar, so it needs to be told which way the app
 * is currently pointed. `system` is the app's own default, and matches the
 * viewer's, so the only thing worth passing on is a deliberate choice.
 */
const currentTheme = (): 'light' | 'dark' | 'system' =>
  (document.documentElement.getAttribute('data-theme') as 'light' | 'dark' | null) ?? 'system';

export function DocumentPreview({ doc, onClose }: { doc: DocumentRecord; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /*
   * Opening a file writes an audit row, so this must happen once per opening
   * and not once per effect run — React runs effects twice in development, and
   * "Lucy opened your contract" appearing twice for one glance is wrong in a
   * record people are meant to trust.
   */
  const asked = useRef<string | null>(null);

  useEffect(() => {
    // Only the first run records the read; a re-run still needs its link.
    const record = asked.current !== doc.id;
    asked.current = doc.id;
    let cancelled = false;
    /*
     * The link is signed for five minutes rather than the one used for a
     * download: the viewer may fetch a large file in ranges, and a link that
     * expires mid-read fails halfway through with nothing useful on screen.
     * Passing the id records the read in the access log, exactly as opening
     * the file does — looking at a document on screen is still looking at it.
     */
    documentService.getDownloadUrl(getBrowserSupabase(), doc.storage_path, 300, record ? doc.id : undefined)
      .then((signed) => { if (!cancelled) setUrl(signed); })
      .catch((e) => { if (!cancelled) setError(friendlyError(e)); });
    return () => { cancelled = true; };
  }, [doc.storage_path, doc.id]);

  return (
    <Overlay title={doc.name} onClose={onClose}>
      <div className="preview-frame">
        {error ? <p className="error" role="alert">{error}</p> : null}
        {url && !error ? (
          <FileViewer
            url={url}
            filename={extensionHint(doc.storage_path)}
            /*
             * Without an explicit `pdf.workerUrl`, the viewer first *probes*
             * whether a real Worker is usable before committing to one — and
             * when that probe doesn't come back a clean "compatible", it falls
             * through to a main-thread "fake worker" that dynamically
             * `import()`s this same script. That import reliably fails here
             * ("Setting up fake worker failed: Invalid or unexpected token"),
             * even though the file itself is byte-correct — confirmed via
             * direct curl against dev and a real production build. Naming the
             * URL explicitly skips the flaky probe/fallback chain entirely and
             * commits straight to a dedicated Worker thread, which is already
             * permitted by the CSP's `worker-src 'self' blob:'`.
             */
            options={{ theme: currentTheme(), pdf: { workerUrl: '/file-viewer/vendor/pdf/pdf.worker.mjs' } }}
            style={{ width: '100%', height: '100%' }}
          />
        ) : null}
        {!url && !error ? <p className="muted">Opening…</p> : null}
      </div>
    </Overlay>
  );
}
