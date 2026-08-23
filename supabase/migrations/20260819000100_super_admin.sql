-- Self-role protection.
--
-- An administrator may edit any role in the workspace except the one they hold
-- themselves. Two failure modes motivate this: privilege escalation (adding
-- capabilities to your own role) and self-lockout (removing the permission that
-- lets you manage roles at all, leaving a workspace nobody can administer).
--
-- A Super Administrator is exempt, and is the role that repairs the others.
-- The exemption is carried as a capability rather than a new tier, because RLS
-- reads the tier and both roles remain plain admins to the database.

-- The role the caller currently holds, if any.
create or replace function public.current_role_id() returns uuid
language sql stable security definer set search_path = public as $$
  select role_id from profiles where id = auth.uid()
$$;

-- True when the caller's role may edit its own definition.
create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select 'user.role_management_self' = any (r.permissions)
      from profiles p join roles r on r.id = p.role_id
     where p.id = auth.uid()
  ), false)
$$;

grant execute on function public.current_role_id() to authenticated;
grant execute on function public.is_super_admin() to authenticated;

/*
 * Enforced as a trigger rather than an RLS policy so that the refusal carries a
 * message. A policy would simply return "no rows", which reads as a missing
 * record rather than a deliberate refusal.
 */
create or replace function public.guard_own_role() returns trigger
language plpgsql security definer set search_path = public as $$
declare target uuid := coalesce(new.id, old.id);
begin
  if is_super_admin() then
    return coalesce(new, old);
  end if;

  if target = current_role_id() then
    raise exception 'You cannot change the role you are assigned to. Ask a Super Administrator.'
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end $$;

create trigger roles_guard_own_role
before update or delete on roles
for each row execute function guard_own_role();

/*
 * The same reasoning applied to assignment: moving yourself onto a different
 * role is escalation by another route, so only a Super Administrator may do it.
 */
create or replace function public.guard_own_role_assignment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.id = auth.uid()
     and new.role_id is distinct from old.role_id
     and not is_super_admin() then
    raise exception 'You cannot change your own role. Ask a Super Administrator.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger profiles_guard_own_role_assignment
before update of role_id on profiles
for each row execute function guard_own_role_assignment();

-- Super Administrator ships alongside the other system roles.
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
    (org, 'Administrator', 'Manages the workspace. Cannot edit its own role.', 'admin',
     array[
       'course.view','course.update_progress','course.create','course.edit','course.assign','course.bulk_assign',
       'task.view','task.complete','task.create','task.assign','task.bulk_assign',
       'event.view','event.rsvp','event.create','event.edit','event.manage_participants',
       'document.view','document.upload_personal','document.manage_shared','document.bulk_manage',
       'onboarding.view','onboarding.complete','onboarding.create','onboarding.template.manage','onboarding.bulk_assign',
       'employee.view_self','employee.view_all','employee.create','employee.edit','employee.deactivate',
       'department.view','analytics.view_summary','analytics.view_full',
       'report.view_summary','report.view_full','organisation.settings','user.role_management'
     ], true),
    (org, 'Super Administrator', 'Full control, including editing its own role.', 'admin',
     array[
       'course.view','course.update_progress','course.create','course.edit','course.assign','course.bulk_assign',
       'task.view','task.complete','task.create','task.assign','task.bulk_assign',
       'event.view','event.rsvp','event.create','event.edit','event.manage_participants',
       'document.view','document.upload_personal','document.manage_shared','document.bulk_manage',
       'onboarding.view','onboarding.complete','onboarding.create','onboarding.template.manage','onboarding.bulk_assign',
       'employee.view_self','employee.view_all','employee.create','employee.edit','employee.deactivate',
       'department.view','analytics.view_summary','analytics.view_full',
       'report.view_summary','report.view_full','organisation.settings',
       'user.role_management','user.role_management_self'
     ], true)
  on conflict (organisation_id, name) do nothing;
$$;

/*
 * Within-tier enforcement for the roles table.
 *
 * The tier alone is too coarse here: a Learning Coordinator is an admin to the
 * database, so the old policy let it rewrite every role in the workspace by
 * calling PostgREST directly, whatever the desktop UI chose to show. Role
 * management is the one place where that gap is an escalation path — a role
 * that can edit roles can grant itself anything — so the policy now reads the
 * granted permission list rather than the tier.
 */
create or replace function public.has_permission(capability text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select capability = any (r.permissions)
      from profiles p join roles r on r.id = p.role_id
     where p.id = auth.uid()
  ), false)
$$;

grant execute on function public.has_permission(text) to authenticated;

drop policy role_admin_write on roles;
create policy role_manager_write on roles for all to authenticated
  using (organisation_id = current_org_id() and is_admin() and has_permission('user.role_management'))
  with check (organisation_id = current_org_id() and is_admin() and has_permission('user.role_management'));
