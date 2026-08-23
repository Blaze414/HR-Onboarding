import type { Db } from '../supabase';
import type { Role, UserRole } from '../types';

/**
 * Roles are data. The tier (employee | admin) is what the database enforces;
 * the permission list refines the experience inside that tier.
 */
export async function listRoles(db: Db): Promise<Role[]> {
  const { data, error } = await db.from('roles').select('*').order('is_system', { ascending: false }).order('name');
  if (error) throw error;
  return (data ?? []) as Role[];
}

export async function getRole(db: Db, id: string): Promise<Role | null> {
  const { data, error } = await db.from('roles').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as Role) ?? null;
}

export async function createRole(
  db: Db, organisationId: string,
  input: { name: string; description?: string | null; base_role: UserRole; permissions: string[] },
): Promise<Role> {
  const { data, error } = await db.from('roles')
    .insert({ ...input, organisation_id: organisationId }).select('*').single();
  if (error) throw error;
  return data as Role;
}

export async function updateRole(db: Db, id: string, patch: Partial<Role>): Promise<Role> {
  const { data, error } = await db.from('roles').update({
    name: patch.name,
    description: patch.description,
    base_role: patch.base_role,
    permissions: patch.permissions,
  }).eq('id', id).select('*').single();
  if (error) throw error;
  return data as Role;
}

export async function deleteRole(db: Db, id: string) {
  const { error } = await db.from('roles').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Assigning a role. Only role_id is written — a database trigger derives
 * profiles.role from the role's base_role so the tier can never disagree with
 * the assignment.
 */
export async function assignRole(db: Db, userId: string, roleId: string) {
  const { error } = await db.from('profiles').update({ role_id: roleId }).eq('id', userId);
  if (error) throw error;
}

export async function countHolders(db: Db, roleId: string): Promise<number> {
  const { count, error } = await db.from('profiles')
    .select('id', { count: 'exact', head: true }).eq('role_id', roleId);
  if (error) throw error;
  return count ?? 0;
}
