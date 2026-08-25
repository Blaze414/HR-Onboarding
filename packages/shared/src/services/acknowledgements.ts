import type { Db } from '../supabase';
import type { DocumentRecord, OutstandingAcknowledgement } from '../types';

/**
 * Read receipts for documents.
 *
 * An acknowledgement is a fact about a moment, so there is no update and no
 * delete — the policies allow insert only, and only for yourself. Recording one
 * twice is not an error; the second attempt is simply ignored.
 *
 * Receipts are per *version*. Replacing the file behind a policy bumps its
 * version, which retires every receipt against the old one: somebody who read
 * last year's handbook has not read this year's, and a report that says
 * otherwise is worse than no report.
 */
export const acknowledgementService = {
  async acknowledge(db: Db, documentId: string, userId: string, organisationId: string): Promise<void> {
    // Read at insert time rather than passed in: the version a receipt records
    // must be the one currently published, not the one the screen was showing
    // when it loaded.
    const { data: document, error: readError } = await db
      .from('documents')
      .select('version')
      .eq('id', documentId)
      .single();
    if (readError) throw readError;

    const { error } = await db
      .from('document_acknowledgements')
      .upsert(
        {
          document_id: documentId,
          user_id: userId,
          organisation_id: organisationId,
          version: (document as { version: number }).version,
        },
        { onConflict: 'document_id,user_id,version', ignoreDuplicates: true },
      );
    if (error) throw error;
  },

  /**
   * Which documents the person has acknowledged *at the version now published*.
   *
   * A receipt against an older version is history, not cover, so it is not in
   * this set — which is what puts the document back in front of them.
   */
  async mine(db: Db, userId: string): Promise<Set<string>> {
    const { data, error } = await db
      .from('document_acknowledgements')
      .select('document_id, version, document:documents!inner(version)')
      .eq('user_id', userId);
    if (error) throw error;

    type Row = { document_id: string; version: number; document: { version: number } | { version: number }[] };
    return new Set(
      (data ?? [])
        .filter((row: Row) => {
          const current = Array.isArray(row.document) ? row.document[0] : row.document;
          return current?.version === row.version;
        })
        .map((row: Row) => row.document_id),
    );
  },

  /**
   * Documents this person has read at *some* version.
   *
   * The difference between this and `mine` is the whole point of versioning: a
   * document in this set but not that one has changed since they read it, which
   * is a different sentence to show them than "you have never seen this".
   */
  async everRead(db: Db, userId: string): Promise<Set<string>> {
    const { data, error } = await db
      .from('document_acknowledgements')
      .select('document_id')
      .eq('user_id', userId);
    if (error) throw error;
    return new Set((data ?? []).map((row: { document_id: string }) => row.document_id));
  },

  /** Who still owes one, one row per person per document. */
  async outstanding(db: Db): Promise<OutstandingAcknowledgement[]> {
    const { data, error } = await db
      .from('outstanding_acknowledgements')
      .select('*')
      .order('document_name')
      .order('employee_name');
    if (error) throw error;
    return (data ?? []) as OutstandingAcknowledgement[];
  },

  async requiringAcknowledgement(db: Db): Promise<DocumentRecord[]> {
    const { data, error } = await db
      .from('documents')
      .select('*')
      .eq('requires_acknowledgement', true)
      .order('name');
    if (error) throw error;
    return (data ?? []) as DocumentRecord[];
  },
};
