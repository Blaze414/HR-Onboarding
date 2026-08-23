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
export async function getDownloadUrl(db: Db, storagePath: string, expiresIn = 60): Promise<string> {
  const { data, error } = await db.storage
    .from(DOCUMENTS_BUCKET).createSignedUrl(storagePath, expiresIn);
  if (error) throw error;
  return data.signedUrl;
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
