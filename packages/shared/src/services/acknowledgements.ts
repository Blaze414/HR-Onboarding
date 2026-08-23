import type { Db } from '../supabase';
import type { DocumentRecord, OutstandingAcknowledgement } from '../types';

/**
 * Read receipts for documents.
 *
 * An acknowledgement is a fact about a moment, so there is no update and no
 * delete — the policies allow insert only, and only for yourself. Recording one
 * twice is not an error; the second attempt is simply ignored.
 */
export const acknowledgementService = {
  async acknowledge(db: Db, documentId: string, userId: string, organisationId: string): Promise<void> {
    const { error } = await db
      .from('document_acknowledgements')
      .upsert(
        { document_id: documentId, user_id: userId, organisation_id: organisationId },
        { onConflict: 'document_id,user_id', ignoreDuplicates: true },
      );
    if (error) throw error;
  },

  /** Which of these documents the person has already acknowledged. */
  async mine(db: Db, userId: string): Promise<Set<string>> {
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
