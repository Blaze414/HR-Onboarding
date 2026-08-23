import type { Db } from '../supabase';
import type {
  CredentialType, DepartmentCoverage, EmployeeCredential, ExpiringCredential,
} from '../types';
import { uploadDocument } from './documents';

const SELECT = `
  *,
  type:credential_types(id,name,requires_expiry,is_sensitive,verification_guidance),
  employee:profiles!employee_credentials_employee_id_fkey(id,name,email),
  verifier:profiles!employee_credentials_verified_by_fkey(id,name),
  document:documents(id,name,storage_path)
`;

/**
 * Optional documents and certifications.
 *
 * Distinct from a document *request*: nobody asked for these. Somebody is
 * offering a qualification, and the reason to store it is that it changes where
 * they could be rostered — which only holds if the record says what kind of
 * thing it is, who issued it, and when it stops being true.
 */
export const credentialService = {
  async listTypes(db: Db): Promise<CredentialType[]> {
    const { data, error } = await db
      .from('credential_types')
      .select('*, departments:credential_department_coverage(department_id,is_required)')
      .order('name');
    if (error) throw error;
    return (data ?? []) as CredentialType[];
  },

  async mine(db: Db, employeeId: string): Promise<EmployeeCredential[]> {
    const { data, error } = await db
      .from('employee_credentials')
      .select(SELECT)
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as EmployeeCredential[];
  },

  /** Everything waiting to be checked. A claim is not cover until it is. */
  async awaitingCheck(db: Db): Promise<EmployeeCredential[]> {
    const { data, error } = await db
      .from('employee_credentials')
      .select(SELECT)
      .eq('status', 'Pending')
      .order('created_at');
    if (error) throw error;
    return (data ?? []) as EmployeeCredential[];
  },

  /**
   * Offers a credential, with its file.
   *
   * The scan is an ordinary document owned by the person, so they keep their own
   * copy and the storage rules are the ones already in force.
   */
  async submit(db: Db, input: {
    organisationId: string; employeeId: string;
    credentialTypeId?: string | null; title: string; issuer?: string | null;
    referenceNumber?: string | null; jurisdiction?: string | null; conditions?: string | null;
    issuedOn?: string | null; expiresOn?: string | null;
    file?: Blob | null; fileName?: string; contentType?: string;
  }): Promise<void> {
    let documentId: string | null = null;
    if (input.file && input.fileName) {
      const document = await uploadDocument(db, {
        organisationId: input.organisationId,
        ownerId: input.employeeId,
        actorId: input.employeeId,
        name: input.title,
        fileName: input.fileName,
        file: input.file,
        contentType: input.contentType,
        category: 'HR Documents',
        description: 'Certificate or qualification provided by the employee.',
      });
      documentId = document.id;
    }

    const { error } = await db.from('employee_credentials').insert({
      organisation_id: input.organisationId,
      employee_id: input.employeeId,
      credential_type_id: input.credentialTypeId || null,
      title: input.title,
      issuer: input.issuer || null,
      reference_number: input.referenceNumber || null,
      jurisdiction: input.jurisdiction || null,
      conditions: input.conditions || null,
      issued_on: input.issuedOn || null,
      expires_on: input.expiresOn || null,
      document_id: documentId,
    });
    if (error) throw error;
  },

  /** Records the outcome of a check, and how it was reached. */
  async review(db: Db, id: string, reviewerId: string, input: {
    accepted: boolean; method?: string; originalSighted?: boolean; note?: string;
  }): Promise<void> {
    const { error } = await db.from('employee_credentials').update({
      status: input.accepted ? 'Verified' : 'Rejected',
      verified_by: reviewerId,
      verified_at: new Date().toISOString(),
      verification_method: input.accepted ? input.method : null,
      original_sighted: input.accepted ? Boolean(input.originalSighted) : false,
      review_note: input.note || null,
    }).eq('id', id);
    if (error) throw error;
  },

  /** Who could be rostered where, and on the strength of what. */
  async coverage(db: Db, departmentId?: string): Promise<DepartmentCoverage[]> {
    let query = db.from('department_coverage').select('*').order('department_name').order('employee_name');
    if (departmentId) query = query.eq('department_id', departmentId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as DepartmentCoverage[];
  },

  async expiring(db: Db): Promise<ExpiringCredential[]> {
    const { data, error } = await db
      .from('expiring_credentials')
      .select('*')
      .order('days_left', { ascending: true });
    if (error) throw error;
    return (data ?? []) as ExpiringCredential[];
  },

  /** Marks lapsed credentials expired and tells the person and their manager. */
  async sweepExpired(db: Db): Promise<number> {
    const { data, error } = await db.rpc('expire_credentials');
    if (error) throw error;
    return (data as number) ?? 0;
  },
};
