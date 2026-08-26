-- The file is as private as the row.
--
-- Storage read access was checked against the organisation folder alone: any
-- signed-in colleague could fetch any object belonging to their workspace,
-- including somebody else's employment agreement. Row level security on the
-- `documents` table hid the row, so the app never offered the path — but a path
-- is guessable, and hiding a row is not the same as protecting a file.
--
-- Nothing exploited this while every object was a placeholder, which is exactly
-- why it survived: there was nothing behind the paths to find. Making the
-- documents real made it a real hole, and the check that walks every document
-- and fetches it found it immediately.
--
-- The rule now mirrors the row rule, deliberately clause for clause:
--
--   {org}/shared/...        anybody in the organisation
--   {org}/{owner}/...       that person, their manager, or an administrator
--
-- Managers are included because `document_read_team` already lets a manager see
-- their reports' documents; leaving them out here would break returning a
-- signed document to the person who asked for it.

drop policy if exists "documents read own organisation" on storage.objects;

create policy "documents read what the row allows"
on storage.objects for select to authenticated
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = public.current_org_id()::text
  and (
    -- Published to the workspace.
    (storage.foldername(name))[2] = 'shared'
    -- Your own.
    or (storage.foldername(name))[2] = auth.uid()::text
    -- Whoever keeps the records, and the person's own manager.
    or public.is_admin()
    or public.is_manager_of(((storage.foldername(name))[2])::uuid)
  )
);

/*
 * `is_manager_of` takes a uuid, and the second path segment is text that is
 * usually one — but not always: a path could be malformed, or carry a folder
 * name from some future feature. A cast that raises would turn a bad path into
 * a failed request for everybody, so it is guarded.
 */
create or replace function public.is_manager_of_path(segment text)
returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return public.is_manager_of(segment::uuid);
exception when invalid_text_representation then
  return false;
end $$;

grant execute on function public.is_manager_of_path(text) to authenticated;

drop policy if exists "documents read what the row allows" on storage.objects;

create policy "documents read what the row allows"
on storage.objects for select to authenticated
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = public.current_org_id()::text
  and (
    (storage.foldername(name))[2] = 'shared'
    or (storage.foldername(name))[2] = auth.uid()::text
    or public.is_admin()
    or public.is_manager_of_path((storage.foldername(name))[2])
  )
);
