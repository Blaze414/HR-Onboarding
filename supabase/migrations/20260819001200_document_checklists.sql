-- Checklists of documents.
--
-- Asking for one document at a time is fine for an exception and hopeless for a
-- new starter, who needs the same eight things every time. A checklist states
-- that set once; applying it raises every request in one action, with due dates
-- worked out from the person's start date rather than typed in eight times.

create table document_checklists (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  name            text not null,
  description     text,
  -- Joining and leaving need different paperwork, and mixing them is how a
  -- leaver ends up asked for a bank form.
  kind            plan_kind not null default 'Onboarding',
  created_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organisation_id, name)
);

create table document_checklist_items (
  id                   uuid primary key default gen_random_uuid(),
  organisation_id      uuid not null references organisations(id) on delete cascade,
  checklist_id         uuid not null references document_checklists(id) on delete cascade,
  title                text not null,
  instructions         text,
  -- The file to download and sign, where there is one.
  template_document_id uuid references documents(id) on delete set null,
  -- Days after the person's start date. Kept relative so one checklist serves
  -- every starter without editing.
  due_after_days       int not null default 7,
  sort_order           int not null default 0
);

create index on document_checklist_items (checklist_id, sort_order);

create trigger document_checklists_set_updated_at before update on document_checklists
for each row execute function set_updated_at();

alter table document_checklists       enable row level security;
alter table document_checklists       force row level security;
alter table document_checklist_items  enable row level security;
alter table document_checklist_items  force row level security;

-- Readable by the workspace so an employee can be told what a pack contains;
-- writable only with the permission that owns document requests.
create policy checklist_read on document_checklists for select to authenticated
  using (organisation_id = current_org_id());
create policy checklist_write on document_checklists for all to authenticated
  using (organisation_id = current_org_id() and is_admin() and has_permission('document.request'))
  with check (organisation_id = current_org_id() and is_admin() and has_permission('document.request'));

create policy checklist_item_read on document_checklist_items for select to authenticated
  using (organisation_id = current_org_id());
create policy checklist_item_write on document_checklist_items for all to authenticated
  using (organisation_id = current_org_id() and is_admin() and has_permission('document.request'))
  with check (organisation_id = current_org_id() and is_admin() and has_permission('document.request'));

grant select, insert, update, delete on public.document_checklists to authenticated;
grant select, insert, update, delete on public.document_checklist_items to authenticated;

/*
 * Raises every request in a checklist for one person.
 *
 * Due dates are computed from the start date the caller gives, so the whole pack
 * lands with sensible deadlines instead of eight identical ones. Already-raised
 * items are skipped, which makes re-applying a checklist safe — the usual reason
 * to re-apply is that the checklist gained an item after somebody joined.
 */
create or replace function public.apply_document_checklist(
  checklist uuid, employee uuid, start_date date default current_date
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  org uuid := current_org_id();
  raised integer := 0;
  item record;
begin
  if not (is_admin() and has_permission('document.request')) then
    raise exception 'You do not have permission to request documents.'
      using errcode = 'insufficient_privilege';
  end if;

  for item in
    select * from document_checklist_items
     where checklist_id = checklist and organisation_id = org
     order by sort_order
  loop
    -- Skip anything already asked for and not yet closed, so re-applying adds
    -- what is new rather than duplicating what is outstanding.
    if not exists (
      select 1 from document_requests
       where employee_id = employee
         and title = item.title
         and status in ('Requested', 'Submitted', 'Returned')
    ) then
      insert into document_requests (
        organisation_id, employee_id, requested_by, title, instructions,
        template_document_id, due_date
      ) values (
        org, employee, auth.uid(), item.title, item.instructions,
        item.template_document_id, start_date + item.due_after_days
      );
      raised := raised + 1;
    end if;
  end loop;

  return raised;
end $$;

grant execute on function public.apply_document_checklist(uuid, uuid, date) to authenticated;
