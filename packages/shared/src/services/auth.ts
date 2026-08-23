import type { Db } from '../supabase';
import type { Profile } from '../types';

export async function signIn(db: Db, email: string, password: string) {
  const { data, error } = await db.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  return data;
}

export async function signOut(db: Db) {
  const { error } = await db.auth.signOut();
  if (error) throw error;
}

/**
 * The signed-in user's profile carries the organisation they belong to.
 * Tenancy always comes from here, never from anything the client supplies.
 */
export async function loadProfile(db: Db, userId: string): Promise<Profile | null> {
  const { data, error } = await db
    .from('profiles')
    .select('*, department:departments!profiles_department_id_fkey(id,name), manager:profiles!manager_id(id,name), role_profile:roles(id,name,permissions,base_role)')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as Profile) ?? null;
}

export async function updateOwnProfile(
  db: Db, userId: string, patch: Partial<Pick<Profile, 'name' | 'phone' | 'job_title' | 'avatar_url'>>,
): Promise<Profile> {
  const { data, error } = await db
    .from('profiles').update(patch).eq('id', userId).select('*').single();
  if (error) throw error;
  return data as Profile;
}
