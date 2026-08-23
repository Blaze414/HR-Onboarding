-- Custom roles.
--
-- profiles.role stays the coarse security tier (employee | admin) because that
-- is what every RLS policy reads. A custom role refines what its holders see
-- and can reach *within* that tier: it carries a base_role and an explicit list
-- of capability keys. Assigning a role therefore always writes both columns, so
-- the database boundary and the client capability set never drift apart.

create table roles (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  name            text not null,
  description     text,
  base_role       user_role not null default 'employee',
  permissions     text[] not null default '{}',
  -- System roles ship with the workspace and cannot be deleted.
  is_system       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organisation_id, name)
);

create index on roles (organisation_id);

alter table profiles add column role_id uuid references roles(id) on delete set null;
create index on profiles (role_id);

create trigger roles_set_updated_at before update on roles
for each row execute function set_updated_at();

alter table roles enable row level security;
alter table roles force row level security;

create policy role_read on roles for select to authenticated
  using (organisation_id = current_org_id());
create policy role_admin_write on roles for all to authenticated
  using (organisation_id = current_org_id() and is_admin())
  with check (organisation_id = current_org_id() and is_admin());

grant select, insert, update, delete on public.roles to authenticated;

-- Creates the two system roles a workspace assumes, for one organisation.
-- Called by the seed, and by anything that provisions a new organisation.
create or replace function ensure_system_roles(org uuid) returns void
language sql as $$
  insert into roles (organisation_id, name, description, base_role, permissions, is_system)
  values
    (org, 'Employee', 'Day-to-day access to your own work.', 'employee',
     array[
       'course.view','course.update_progress','task.view','task.complete','event.view','event.rsvp',
       'document.view','document.upload_personal','onboarding.view','onboarding.complete',
       'employee.view_self','report.view_summary'
     ], true),
    (org, 'Administrator', 'Full management of the workspace.', 'admin',
     array[
       'course.view','course.update_progress','course.create','course.edit','course.assign','course.bulk_assign',
       'task.view','task.complete','task.create','task.assign','task.bulk_assign',
       'event.view','event.rsvp','event.create','event.edit','event.manage_participants',
       'document.view','document.upload_personal','document.manage_shared','document.bulk_manage',
       'onboarding.view','onboarding.complete','onboarding.create','onboarding.template.manage','onboarding.bulk_assign',
       'employee.view_self','employee.view_all','employee.create','employee.edit','employee.deactivate',
       'department.view','analytics.view_summary','analytics.view_full',
       'report.view_summary','report.view_full','organisation.settings','user.role_management'
     ], true)
  on conflict (organisation_id, name) do nothing;
$$;

/*
 * Keeps the security tier and the assigned role in agreement. Without this a
 * custom role could claim admin capabilities while RLS still saw an employee,
 * or the reverse — the two would disagree and the UI would lie.
 */
create or replace function sync_role_tier() returns trigger
language plpgsql as $$
declare base user_role;
begin
  if new.role_id is null then
    return new;
  end if;

  select base_role into base from roles where id = new.role_id;
  if base is null then
    raise exception 'Role does not exist in this organisation';
  end if;

  new.role := base;
  return new;
end $$;

create trigger profiles_sync_role_tier
before insert or update of role_id on profiles
for each row execute function sync_role_tier();
