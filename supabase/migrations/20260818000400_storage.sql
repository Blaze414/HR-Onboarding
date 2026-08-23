-- Document storage. Paths are organisation-aware:
--   {organisation_id}/{owner_id | 'shared'}/{filename}
-- The organisation segment is checked against the caller's own profile, never
-- against a client-supplied value.

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "documents read own organisation"
on storage.objects for select to authenticated
using (bucket_id = 'documents'
       and (storage.foldername(name))[1] = public.current_org_id()::text);

create policy "documents upload own organisation"
on storage.objects for insert to authenticated
with check (bucket_id = 'documents'
            and (storage.foldername(name))[1] = public.current_org_id()::text
            and ((storage.foldername(name))[2] = auth.uid()::text or public.is_admin()));

create policy "documents update own"
on storage.objects for update to authenticated
using (bucket_id = 'documents'
       and (storage.foldername(name))[1] = public.current_org_id()::text
       and ((storage.foldername(name))[2] = auth.uid()::text or public.is_admin()));

create policy "documents delete own"
on storage.objects for delete to authenticated
using (bucket_id = 'documents'
       and (storage.foldername(name))[1] = public.current_org_id()::text
       and ((storage.foldername(name))[2] = auth.uid()::text or public.is_admin()));
