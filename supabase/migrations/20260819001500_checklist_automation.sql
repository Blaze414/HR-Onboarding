-- Checklists that fire themselves.
--
-- A checklist still has to be remembered and applied, which is one more thing to
-- do on the day somebody joins — the busiest possible moment to ask HR to
-- remember anything. An automation states the rule once: everyone, or everyone
-- in these departments, gets this pack when they are added.

create table checklist_automations (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  checklist_id    uuid not null references document_checklists(id) on delete cascade,
  -- Null means the whole workspace. A department narrows it, because a developer
  -- and a teacher do not sign the same paperwork.
  department_id   uuid references departments(id) on delete cascade,
  is_active       boolean not null default true,
  created_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (checklist_id, department_id)
);

create index on checklist_automations (organisation_id, is_active);

alter table checklist_automations enable row level security;
alter table checklist_automations force row level security;

create policy automation_read on checklist_automations for select to authenticated
  using (organisation_id = current_org_id());
create policy automation_write on checklist_automations for all to authenticated
  using (organisation_id = current_org_id() and is_admin() and has_permission('document.request'))
  with check (organisation_id = current_org_id() and is_admin() and has_permission('document.request'));

grant select, insert, update, delete on public.checklist_automations to authenticated;

/*
 * Raising the requests, without the permission check.
 *
 * The public function refuses anyone who may not request documents. The trigger
 * below is not a person: it runs as the system, on a rule an administrator
 * already set, and often during an employee creation performed by a service role
 * with no session at all. Splitting the two keeps the guard meaningful where it
 * belongs and the automation working where it must.
 */
create or replace function public.raise_checklist(
  checklist uuid, employee uuid, org uuid, actor uuid, start_date date
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  raised integer := 0;
  item record;
begin
  for item in
    select * from document_checklist_items
     where checklist_id = checklist and organisation_id = org
     order by sort_order
  loop
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
        org, employee, actor, item.title, item.instructions,
        item.template_document_id, start_date + item.due_after_days
      );
      raised := raised + 1;
    end if;
  end loop;
  return raised;
end $$;

-- The public entry point keeps its guard and delegates the work.
create or replace function public.apply_document_checklist(
  checklist uuid, employee uuid, start_date date default current_date
) returns integer
language plpgsql security definer set search_path = public as $$
begin
  if not (is_admin() and has_permission('document.request')) then
    raise exception 'You do not have permission to request documents.'
      using errcode = 'insufficient_privilege';
  end if;
  return raise_checklist(checklist, employee, current_org_id(), auth.uid(), start_date);
end $$;

/*
 * Fires when somebody is added, matching every active automation for their
 * workspace and — if the rule names one — their department.
 */
create or replace function public.apply_automations_to_new_employee() returns trigger
language plpgsql security definer set search_path = public as $$
declare rule record;
begin
  for rule in
    select a.checklist_id
      from checklist_automations a
     where a.organisation_id = new.organisation_id
       and a.is_active
       and (a.department_id is null or a.department_id = new.department_id)
  loop
    perform raise_checklist(
      rule.checklist_id, new.id, new.organisation_id, auth.uid(),
      coalesce(new.start_date, current_date)
    );
  end loop;
  return new;
end $$;

create trigger profile_checklist_automation
after insert on profiles
for each row execute function apply_automations_to_new_employee();
