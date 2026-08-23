import type { Db } from '../supabase';
import type { DocumentRequest, OutstandingDocumentRequest, PlanKind } from '../types';
import { uploadDocument } from './documents';

const SELECT = `
  *,
  employee:profiles!document_requests_employee_id_fkey(id,name,email),
  template:documents!document_requests_template_document_id_fkey(id,name,storage_path),
  submitted:documents!document_requests_submitted_document_id_fkey(id,name,storage_path,created_at),
  reviewer:profiles!document_requests_reviewed_by_fkey(id,name)
`;

/**
 * Asking someone for a document, and getting it back.
 *
 * The two files are ordinary documents, so download, storage and permissions
 * behave exactly as they do everywhere else. This service only manages the
 * request that ties them together.
 */
export const documentRequestService = {
  /** What this person still owes. */
  async mine(db: Db, employeeId: string): Promise<DocumentRequest[]> {
    const { data, error } = await db
      .from('document_requests')
      .select(SELECT)
      .eq('employee_id', employeeId)
      .order('due_date', { ascending: true });
    if (error) throw error;
    return (data ?? []) as DocumentRequest[];
  },

  /** Everything outstanding across the workspace, or one department of it. */
  async outstanding(db: Db, departmentId?: string): Promise<OutstandingDocumentRequest[]> {
    let query = db
      .from('outstanding_document_requests')
      .select('*')
      .order('is_overdue', { ascending: false })
      .order('due_date', { ascending: true });
    if (departmentId) query = query.eq('department_id', departmentId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as OutstandingDocumentRequest[];
  },

  async forEmployee(db: Db, employeeId: string): Promise<DocumentRequest[]> {
    return documentRequestService.mine(db, employeeId);
  },

  async create(db: Db, input: {
    organisationId: string; employeeId: string; requestedBy: string;
    title: string; instructions?: string | null;
    templateDocumentId?: string | null; dueDate?: string | null;
    onboardingStepId?: string | null;
  }): Promise<DocumentRequest> {
    const { data, error } = await db.from('document_requests').insert({
      organisation_id: input.organisationId,
      employee_id: input.employeeId,
      requested_by: input.requestedBy,
      title: input.title,
      instructions: input.instructions ?? null,
      template_document_id: input.templateDocumentId ?? null,
      onboarding_step_id: input.onboardingStepId ?? null,
      due_date: input.dueDate ?? null,
    }).select(SELECT).single();
    if (error) throw error;
    return data as DocumentRequest;
  },

  /**
   * Returns the signed or completed file.
   *
   * The upload is owned by the employee, so they keep their own copy for
   * reference — a signed contract you cannot look at again later is half a
   * record. The status is set by the database, not here: an employee submits,
   * they do not decide the outcome.
   */
  async submit(db: Db, input: {
    requestId: string; organisationId: string; employeeId: string;
    file: Blob; fileName: string; contentType?: string; title: string;
  }): Promise<void> {
    const document = await uploadDocument(db, {
      organisationId: input.organisationId,
      ownerId: input.employeeId,
      actorId: input.employeeId,
      name: input.title,
      fileName: input.fileName,
      file: input.file,
      contentType: input.contentType,
      category: 'HR Documents',
      description: 'Returned in response to a document request.',
    });

    const { error } = await db
      .from('document_requests')
      .update({ submitted_document_id: document.id })
      .eq('id', input.requestId);
    if (error) throw error;
  },

  /** Accepts what came back, or sends it back with a reason. */
  async review(db: Db, requestId: string, reviewerId: string, accepted: boolean, note?: string): Promise<void> {
    const { error } = await db.from('document_requests').update({
      status: accepted ? 'Accepted' : 'Returned',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      review_note: note ?? null,
    }).eq('id', requestId);
    if (error) throw error;
  },

  // ---------------------------------------------------------------- checklists
  async listChecklists(db: Db, kind?: PlanKind) {
    let query = db
      .from('document_checklists')
      .select('*, items:document_checklist_items(*)')
      .order('name');
    if (kind) query = query.eq('kind', kind);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },

  /** Raises every request in a checklist for one person. */
  async applyChecklist(db: Db, checklistId: string, employeeId: string, startDate?: string): Promise<number> {
    const { data, error } = await db.rpc('apply_document_checklist', {
      checklist: checklistId,
      employee: employeeId,
      start_date: startDate ?? new Date().toISOString().slice(0, 10),
    });
    if (error) throw error;
    return (data as number) ?? 0;
  },

  /** Keeps what was asked of one person as a reusable checklist. */
  async saveAsChecklist(db: Db, employeeId: string, name: string, kind: PlanKind, description?: string): Promise<string> {
    const { data, error } = await db.rpc('save_requests_as_checklist', {
      employee: employeeId,
      checklist_name: name,
      checklist_kind: kind,
      checklist_description: description ?? null,
    });
    if (error) throw error;
    return data as string;
  },

  // ---------------------------------------------------------------- automation
  async listAutomations(db: Db) {
    const { data, error } = await db
      .from('checklist_automations')
      .select('*, checklist:document_checklists(id,name,kind), department:departments(id,name)')
      .order('created_at');
    if (error) throw error;
    return data ?? [];
  },

  async setAutomation(db: Db, input: {
    organisationId: string; checklistId: string; departmentId: string | null; createdBy: string;
  }) {
    const { error } = await db.from('checklist_automations').upsert({
      organisation_id: input.organisationId,
      checklist_id: input.checklistId,
      department_id: input.departmentId,
      created_by: input.createdBy,
      is_active: true,
    }, { onConflict: 'checklist_id,department_id' });
    if (error) throw error;
  },

  async removeAutomation(db: Db, id: string) {
    const { error } = await db.from('checklist_automations').delete().eq('id', id);
    if (error) throw error;
  },
};

/**
 * Authoring checklists.
 *
 * Kept apart from the request service above because the audiences differ: this
 * is set up once by whoever owns the paperwork, while requests are raised and
 * returned every week.
 */
export const checklistService = {
  async get(db: Db, id: string) {
    const { data, error } = await db
      .from('document_checklists')
      .select('*, items:document_checklist_items(*)')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async save(db: Db, input: {
    id?: string; organisationId: string; name: string;
    description?: string | null; kind: PlanKind; createdBy: string;
  }): Promise<string> {
    if (input.id) {
      const { error } = await db.from('document_checklists').update({
        name: input.name, description: input.description ?? null, kind: input.kind,
      }).eq('id', input.id);
      if (error) throw error;
      return input.id;
    }
    const { data, error } = await db.from('document_checklists').insert({
      organisation_id: input.organisationId,
      name: input.name,
      description: input.description ?? null,
      kind: input.kind,
      created_by: input.createdBy,
    }).select('id').single();
    if (error) throw error;
    return (data as { id: string }).id;
  },

  async remove(db: Db, id: string): Promise<void> {
    const { error } = await db.from('document_checklists').delete().eq('id', id);
    if (error) throw error;
  },

  /**
   * Replaces a checklist's items wholesale.
   *
   * The editor works on the whole list at once — reorder, rename, drop a line —
   * so patching item by item would need change tracking to express what the
   * person already sees in front of them.
   */
  async replaceItems(db: Db, organisationId: string, checklistId: string, items: {
    title: string; instructions?: string | null;
    templateDocumentId?: string | null; dueAfterDays: number;
  }[]): Promise<void> {
    const { error: cleared } = await db
      .from('document_checklist_items')
      .delete()
      .eq('checklist_id', checklistId);
    if (cleared) throw cleared;

    if (items.length === 0) return;
    const { error } = await db.from('document_checklist_items').insert(
      items.map((item, index) => ({
        organisation_id: organisationId,
        checklist_id: checklistId,
        title: item.title,
        instructions: item.instructions ?? null,
        template_document_id: item.templateDocumentId ?? null,
        due_after_days: item.dueAfterDays,
        sort_order: index,
      })),
    );
    if (error) throw error;
  },
};
