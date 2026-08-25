import { DOCUMENTS_BUCKET } from '../constants';
import type { Db } from '../supabase';
import type { DocumentRecord } from '../types';
import { documentStoragePath } from '../utils';
import { logActivity } from './activity';

export interface DocumentFilters {
  search?: string;
  category?: string | 'All';
  /** 'mine' = personal documents, 'shared' = organisation documents. */
  scope?: 'all' | 'mine' | 'shared';
  ownerId?: string;
}

const SELECT = '*, owner:profiles!documents_owner_id_fkey(id,name)';

export async function listDocuments(
  db: Db, userId: string, filters: DocumentFilters = {},
): Promise<DocumentRecord[]> {
  let query = db.from('documents').select(SELECT).order('created_at', { ascending: false });
  if (filters.scope === 'mine') query = query.eq('owner_id', userId);
  if (filters.scope === 'shared') query = query.is('owner_id', null);
  if (filters.ownerId) query = query.eq('owner_id', filters.ownerId);
  if (filters.category && filters.category !== 'All') query = query.eq('category', filters.category);
  if (filters.search) query = query.ilike('name', `%${filters.search}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as DocumentRecord[];
}

/**
 * Whether this document has become an employment record.
 *
 * A shared document is published to the workspace, not evidence about anybody,
 * so it stays deletable. A personal one is a record the employer must keep for
 * seven years (Fair Work Regulations 2009 reg 3.31), with the day it was
 * uploaded left open so a file filed against the wrong person can be taken
 * back off. The database enforces this; the clients ask so they can say why
 * rather than offering a button that fails.
 */
export function isRetainedRecord(doc: DocumentRecord): boolean {
  if (!doc.owner_id || !doc.retain_until) return false;
  const uploadedOn = doc.created_at.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  return uploadedOn < today && doc.retain_until > today;
}

export interface UploadInput {
  organisationId: string;
  /** null uploads a shared organisation document (admin only, enforced by RLS). */
  ownerId: string | null;
  actorId: string;
  name: string;
  category: string;
  description?: string | null;
  courseId?: string | null;
  file: Blob | ArrayBuffer | File;
  fileName: string;
  contentType?: string;
}

export async function uploadDocument(db: Db, input: UploadInput): Promise<DocumentRecord> {
  const path = documentStoragePath(input.organisationId, input.ownerId, input.fileName);

  const { error: uploadError } = await db.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, input.file as Blob, {
      contentType: input.contentType ?? 'application/octet-stream',
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { data, error } = await db.from('documents').insert({
    organisation_id: input.organisationId,
    owner_id: input.ownerId,
    uploaded_by: input.actorId,
    course_id: input.courseId ?? null,
    name: input.name,
    storage_path: path,
    category: input.category,
    file_type: input.contentType ?? null,
    description: input.description ?? null,
  }).select(SELECT).single();

  if (error) {
    // Do not leave an orphaned object behind if the metadata row was rejected.
    await db.storage.from(DOCUMENTS_BUCKET).remove([path]);
    throw error;
  }

  await logActivity(db, {
    organisationId: input.organisationId, actorId: input.actorId, action: 'uploaded_document',
    entityType: 'document', entityId: data.id, metadata: { name: input.name },
  });
  return data as DocumentRecord;
}

/** Short-lived signed URL — the bucket itself is private. */
/**
 * A link to open a file, and the record that somebody did.
 *
 * Both clients route every download through here, which is what makes this the
 * place to log it: signing happens in the browser against Storage, so there is
 * no server request to hook. The `documentId` is optional only because a few
 * callers hold a path and nothing else — pass it wherever it is known, because
 * a document opened without it is a document opened without a trace.
 *
 * The database decides what is worth recording: reading your own file, or a
 * document shared with the whole organisation, is not logged.
 */
export async function getDownloadUrl(
  db: Db, storagePath: string, expiresIn = 60, documentId?: string,
): Promise<string> {
  const { data, error } = await db.storage
    .from(DOCUMENTS_BUCKET).createSignedUrl(storagePath, expiresIn);
  if (error) throw error;

  if (documentId) {
    // Deliberately not awaited into the failure path: a log that can stop
    // somebody opening a contract is worse than a log with a gap in it.
    await db.rpc('log_document_access', { document: documentId })
      .then(() => undefined, () => undefined);
  }

  return data.signedUrl;
}

export interface DocumentAccess {
  id: string;
  document_id: string;
  document_name: string;
  actor_id: string;
  opened_at: string;
  actor?: { id: string; name: string } | { id: string; name: string }[] | null;
}

/** Who has opened this person's files, newest first. */
export async function listDocumentAccess(
  db: Db, subjectId: string, limit = 50,
): Promise<DocumentAccess[]> {
  const { data, error } = await db
    .from('document_access_log')
    .select('id, document_id, document_name, actor_id, opened_at, actor:profiles!document_access_log_actor_id_fkey(id,name)')
    .eq('subject_id', subjectId)
    .order('opened_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as DocumentAccess[];
}

export async function deleteDocument(db: Db, doc: DocumentRecord) {
  const { error } = await db.from('documents').delete().eq('id', doc.id);
  if (error) throw error;
  await db.storage.from(DOCUMENTS_BUCKET).remove([doc.storage_path]);
}

export async function updateDocument(db: Db, id: string, patch: Partial<DocumentRecord>) {
  const { data, error } = await db.from('documents').update(patch).eq('id', id).select(SELECT).single();
  if (error) throw error;
  return data as DocumentRecord;
}
