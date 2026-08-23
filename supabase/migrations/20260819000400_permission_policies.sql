-- Per-operation enforcement in the database.
--
-- Until now the policies asked only "is this an admin?", so the split between
-- create, edit and delete lived entirely in the application. A role without
-- `task.delete` was refused by the server action and then allowed by PostgREST,
-- which means the rule held only for people using the interface.
--
-- These policies close that gap. The tier is still checked — it is the coarse
-- boundary — and the granted permission is now checked alongside it.

/*
 * A person on no custom role falls back to their tier's defaults, which is what
 * the client already does when a role carries no permission list. Without this
 * branch, assigning nobody a role would silently revoke everything from every
 * administrator.
 */
create or replace function public.has_permission(capability text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
             when p.role_id is null then true
             else capability = any (r.permissions)
           end
      from profiles p
      left join roles r on r.id = p.role_id
     where p.id = auth.uid()
  ), false)
$$;

-- Replaces one blanket policy with one policy per operation.
create or replace function public.split_admin_policy(
  tbl text, policy_name text, create_cap text, update_cap text, delete_cap text
) returns void language plpgsql as $$
begin
  execute format('drop policy if exists %I on %I', policy_name, tbl);

  execute format($f$
    create policy %I on %I for insert to authenticated
      with check (organisation_id = current_org_id() and is_admin() and has_permission(%L))
  $f$, policy_name || '_insert', tbl, create_cap);

  execute format($f$
    create policy %I on %I for update to authenticated
      using (organisation_id = current_org_id() and is_admin() and has_permission(%L))
      with check (organisation_id = current_org_id() and is_admin() and has_permission(%L))
  $f$, policy_name || '_update', tbl, update_cap, update_cap);

  execute format($f$
    create policy %I on %I for delete to authenticated
      using (organisation_id = current_org_id() and is_admin() and has_permission(%L))
  $f$, policy_name || '_delete', tbl, delete_cap);
end $$;

select split_admin_policy('courses', 'course_admin_write',
  'course.create', 'course.edit', 'course.delete');

select split_admin_policy('tasks', 'task_admin_write',
  'task.create', 'task.edit', 'task.delete');

select split_admin_policy('events', 'event_admin_write',
  'event.create', 'event.edit', 'event.delete');

select split_admin_policy('departments', 'dept_admin_write',
  'department.manage', 'department.manage', 'department.delete');

select split_admin_policy('course_assignments', 'assignment_admin_write',
  'course.assign', 'course.assign', 'course.assign');

select split_admin_policy('event_participants', 'participant_admin_write',
  'event.manage_participants', 'event.manage_participants', 'event.manage_participants');

select split_admin_policy('onboarding_templates', 'template_admin_write',
  'onboarding.template.manage', 'onboarding.template.manage', 'onboarding.template.delete');

select split_admin_policy('onboarding_template_steps', 'template_step_admin_write',
  'onboarding.template.manage', 'onboarding.template.manage', 'onboarding.template.delete');

select split_admin_policy('employee_onboarding', 'onboarding_admin_write',
  'onboarding.create', 'onboarding.create', 'onboarding.delete');

select split_admin_policy('onboarding_steps', 'onboarding_step_admin_write',
  'onboarding.create', 'onboarding.create', 'onboarding.delete');

select split_admin_policy('documents', 'document_admin_write',
  'document.manage_shared', 'document.manage_shared', 'document.delete');

/*
 * Employee records: creating and editing a person are already distinct
 * permissions, and deactivating is this resource's delete.
 */
select split_admin_policy('profiles', 'profile_admin_write',
  'employee.create', 'employee.edit', 'employee.deactivate');

drop function split_admin_policy(text, text, text, text, text);
