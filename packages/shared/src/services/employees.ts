import type { Db } from '../supabase';
import type { Department, Profile, UserRole } from '../types';
import { logActivity } from './activity';

const SELECT =
  '*, department:departments!profiles_department_id_fkey(id,name), manager:profiles!manager_id(id,name), role_profile:roles(id,name,permissions,base_role)';

export interface EmployeeFilters {
  search?: string;
  departmentId?: string | 'All';
  role?: UserRole | 'All';
  activeOnly?: boolean;
}

export async function listEmployees(db: Db, filters: EmployeeFilters = {}): Promise<Profile[]> {
  let query = db.from('profiles').select(SELECT).order('name');
  if (filters.departmentId && filters.departmentId !== 'All') query = query.eq('department_id', filters.departmentId);
  if (filters.role && filters.role !== 'All') query = query.eq('role', filters.role);
  if (filters.activeOnly) query = query.eq('is_active', true);
  if (filters.search) query = query.or(`name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function getEmployee(db: Db, id: string): Promise<Profile | null> {
  const { data, error } = await db.from('profiles').select(SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as Profile) ?? null;
}

export async function updateEmployee(db: Db, id: string, patch: Partial<Profile>): Promise<Profile> {
  const { data, error } = await db.from('profiles').update({
    name: patch.name,
    // role_id is authoritative; a trigger derives the security tier from it.
    role_id: patch.role_id,
    job_title: patch.job_title,
    department_id: patch.department_id,
    manager_id: patch.manager_id,
    start_date: patch.start_date,
    phone: patch.phone,
    is_active: patch.is_active,
  }).eq('id', id).select(SELECT).single();
  if (error) throw error;
  return data as Profile;
}

export async function setEmployeeActive(db: Db, id: string, isActive: boolean) {
  return updateEmployee(db, id, { is_active: isActive });
}

/**
 * Creating an employee needs an auth user, which the anon key cannot mint.
 * The desktop app therefore calls its own server route, which uses the service
 * role key on the server side only, and that route calls back into this
 * function afterwards to record the activity entry.
 */
export async function recordEmployeeCreated(
  db: Db, organisationId: string, actorId: string, employee: Profile,
) {
  await logActivity(db, {
    organisationId, actorId, action: 'created_employee',
    entityType: 'profile', entityId: employee.id, metadata: { name: employee.name },
  });
}

// ------------------------------------------------------------- departments
export async function listDepartments(db: Db): Promise<Department[]> {
  const { data, error } = await db.from('departments').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as Department[];
}

export async function createDepartment(
  db: Db, organisationId: string, input: { name: string; description?: string | null; manager_id?: string | null },
): Promise<Department> {
  const { data, error } = await db.from('departments')
    .insert({ ...input, organisation_id: organisationId }).select('*').single();
  if (error) throw error;
  return data as Department;
}

export async function updateDepartment(db: Db, id: string, patch: Partial<Department>) {
  const { data, error } = await db.from('departments').update({
    name: patch.name, description: patch.description, manager_id: patch.manager_id,
  }).eq('id', id).select('*').single();
  if (error) throw error;
  return data as Department;
}

export async function deleteDepartment(db: Db, id: string) {
  const { error } = await db.from('departments').delete().eq('id', id);
  if (error) throw error;
}
