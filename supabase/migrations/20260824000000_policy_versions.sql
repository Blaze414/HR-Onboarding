-- A read receipt is about a version, not a document.
--
-- Until now an acknowledgement was keyed on (document, person), so re-issuing a
-- policy left every old receipt in place: the handbook could be replaced on
-- Monday and the report would still say the whole workplace had read it. That
-- is the single most dangerous kind of wrong — a record that looks complete.
--
-- A document now carries a version, the receipt records which version was read,
-- and replacing the file bumps the version, which puts everybody back in the
-- outstanding list and tells them why.

alter table documents
  add column version integer not null default 1;

alter table document_acknowledgements
  add column version integer not null default 1;

-- Receipts are history: the old ones stay, and a person can hold one per
-- version. Nothing is ever overwritten.
alter table document_acknowledgements
  drop constraint document_acknowledgements_pkey,
  add primary key (document_id, user_id, version);

/*
 * The version belongs to the file, not to whoever is editing the row.
 *
 * RLS is row-level, not column-level, so anybody who may update a document may
 * write any column of it — including this one. The guard puts the value back:
 * replacing the stored file bumps the version by exactly one, and every other
 * edit leaves it alone. A client cannot set it at all.
 */
create or replace function public.guard_document_version() returns trigger
language plpgsql as $$
begin
  new.version := old.version
    + (case when new.storage_path is distinct from old.storage_path then 1 else 0 end);
  return new;
end $$;

create trigger document_version_guard
  before update on documents
  for each row execute function public.guard_document_version();

/*
 * Tell people when what they signed off has changed under them.
 *
 * Only for documents that ask for acknowledgement — bumping the version of an
 * ordinary file is not news. Definer because the notification insert is not
 * something the uploader has a grant for, and swallowed because a failed
 * notification must never roll back the upload it describes.
 */
create or replace function public.notify_document_reissued() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.version = old.version or not new.requires_acknowledgement then
    return new;
  end if;

  begin
    insert into notifications (organisation_id, user_id, actor_id, kind, title, body, href, entity_id)
    select new.organisation_id, p.id, auth.uid(), 'event_invited',
           format('%s has been updated', new.name),
           'A new version has been published. Please read it and confirm.',
           '/documents', new.id
    from profiles p
    where p.organisation_id = new.organisation_id
      and p.is_active
      -- Whoever replaced the file does not need telling they replaced it.
      and p.id is distinct from auth.uid();
  exception when others then
    raise warning 'could not announce new version of document %: %', new.id, sqlerrm;
  end;

  return new;
end $$;

create trigger document_reissue_announces
  after update on documents
  for each row execute function public.notify_document_reissued();

-- Outstanding now means "has not read *this* version". Dropped rather than
-- replaced: a new column in the middle changes the column order, which
-- `create or replace view` refuses.
drop view outstanding_acknowledgements;
create view outstanding_acknowledgements with (security_invoker = on) as
select
  d.id            as document_id,
  d.organisation_id,
  d.name          as document_name,
  d.version       as document_version,
  p.id            as employee_id,
  p.name          as employee_name,
  p.email         as employee_email,
  m.name          as manager_name,
  d.created_at    as published_at
from documents d
cross join profiles p
left join profiles m on m.id = p.manager_id
where d.requires_acknowledgement
  and d.organisation_id = p.organisation_id
  and p.is_active
  and not exists (
    select 1 from document_acknowledgements a
     where a.document_id = d.id and a.user_id = p.id and a.version = d.version
  );

grant select on outstanding_acknowledgements to authenticated;
