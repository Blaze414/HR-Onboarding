import type { Db } from '../supabase';

/**
 * Named filters.
 *
 * A view is a path and a query string with a name on it — nothing is stored
 * about what the filters mean, so a saved view keeps working when a report
 * gains a filter, and can never show its owner rows they could not otherwise
 * read. The report still applies its own permission checks on every visit.
 */
export interface SavedView {
  id: string;
  name: string;
  path: string;
  query: string;
  is_shared: boolean;
  owner_id: string;
  created_at: string;
}

/** Views available on one page: the caller's own, plus anything shared. */
export async function listSavedViews(db: Db, path: string): Promise<SavedView[]> {
  const { data, error } = await db
    .from('saved_views')
    .select('*')
    .eq('path', path)
    .order('name');
  if (error) throw error;
  return (data ?? []) as SavedView[];
}

export async function saveView(
  db: Db,
  input: { organisationId: string; ownerId: string; name: string; path: string; query: string; isShared?: boolean },
): Promise<string> {
  const { data, error } = await db
    .from('saved_views')
    // Saving over a name you already used is the expected way to correct a
    // view. Anything else leaves two entries a letter apart in the same menu.
    .upsert({
      organisation_id: input.organisationId,
      owner_id: input.ownerId,
      name: input.name.trim(),
      path: input.path,
      query: input.query.replace(/^\?/, ''),
      is_shared: input.isShared ?? false,
    }, { onConflict: 'owner_id,path,name' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function deleteSavedView(db: Db, id: string): Promise<void> {
  const { error } = await db.from('saved_views').delete().eq('id', id);
  if (error) throw error;
}
