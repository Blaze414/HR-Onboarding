-- Who opened somebody else's file.
--
-- Personal documents include the ones people mind most: a passport scan
-- attached to a credential, a signed contract, a medical note. Any HR user can
-- open them and, until now, nothing recorded that they had. The uncomfortable
-- question — "who has looked at my file?" — had no answer, which is exactly the
-- kind of gap that is invisible until somebody asks.
--
-- This is a log, not a permission. It changes nothing about who *may* read a
-- document; it records that they did, and shows the subject the same list HR
-- sees about themselves.

create table document_access_log (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  document_id     uuid not null references documents(id) on delete cascade,
  -- Copied in rather than joined at read time: the document's owner is what
  -- makes this row somebody's business, and re-parenting a document later must
  -- not silently change whose history it appears in.
  subject_id      uuid references profiles(id) on delete cascade,
  actor_id        uuid not null references profiles(id) on delete cascade,
  document_name   text not null,
  opened_at       timestamptz not null default now()
);

create index on document_access_log (subject_id, opened_at desc);
create index on document_access_log (document_id, opened_at desc);

alter table document_access_log enable row level security;
alter table document_access_log force row level security;

/*
 * Rows are written by a definer function below, never directly, and there is no
 * update or delete policy at all: a log somebody can edit is not a log.
 *
 * Read by the person whose document it was — the point of the whole table — and
 * by whoever holds `report.view_full`. A manager is not on that list: knowing
 * who read your contract is not line-management information.
 */
create policy document_access_read on document_access_log for select to authenticated
  using (
    organisation_id = current_org_id()
    and (subject_id = auth.uid() or has_permission('report.view_full'))
  );

grant select on public.document_access_log to authenticated;

/*
 * Records one opening.
 *
 * Definer because the caller has no insert grant — the whole point is that the
 * person being logged cannot choose not to be. Reading their own file is not
 * logged: it is nobody else's business, and a log that fills with self-reads is
 * a log nobody reads.
 *
 * Shared organisation documents (owner_id is null) are skipped too. The staff
 * handbook is published *to* everybody; recording who opened it would be
 * surveillance rather than a control.
 */
create or replace function public.log_document_access(document uuid) returns void
language plpgsql security definer set search_path = public as $$
declare doc record;
begin
  select id, organisation_id, owner_id, name into doc from documents where id = document;

  if doc.id is null or doc.owner_id is null or doc.owner_id = auth.uid() then
    return;
  end if;

  insert into document_access_log (organisation_id, document_id, subject_id, actor_id, document_name)
  values (doc.organisation_id, doc.id, doc.owner_id, auth.uid(), doc.name);
exception when others then
  -- Never let logging break the thing it is logging. A missed row is a smaller
  -- problem than an HR user unable to open a contract.
  raise warning 'could not log access to document %: %', document, sqlerrm;
end $$;

grant execute on function public.log_document_access(uuid) to authenticated;
