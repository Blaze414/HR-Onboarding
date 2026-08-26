-- Who may run a pay period.
--
-- A separate permission from `employee.edit`, and deliberately not bundled into
-- it. Whoever keeps the people records is very often not whoever runs the pay,
-- and making the two one grant means handing somebody everybody's salary in
-- order to let them correct a job title.
--
-- Restating `ensure_system_roles` rather than only updating the existing rows,
-- because that function is where a new organisation's roles come from: an
-- UPDATE alone gives the permission to today's workspaces and silently
-- withholds it from tomorrow's. The UPDATE below is still needed for
-- workspaces that already exist, including custom roles somebody has built.

create or replace function ensure_system_roles(org uuid) returns void
language sql as $$
  insert into roles (organisation_id, name, description, base_role, permissions, is_system)
  values
    (org, 'Employee', 'Day-to-day access to your own work.', 'employee',
     array[
       'course.view','course.update_progress','task.view','task.complete',
       'event.view','event.rsvp','document.view','document.upload_personal',
       'document.acknowledge','document.review_team','document.submit','onboarding.view',
       'onboarding.complete','employee.view_self','employee.view_team','credential.submit',
       'credential.verify_team','report.view_summary','payroll.view_own'
     ], true),
    (org, 'Administrator', 'Manages the workspace. Cannot edit its own role.', 'admin',
     array[
       'course.view','course.update_progress','course.create','course.edit',
       'course.delete','course.assign','course.bulk_assign','course.verify',
       'task.view','task.complete','task.create','task.edit',
       'task.delete','task.assign','task.bulk_assign','event.view',
       'event.rsvp','event.create','event.edit','event.delete',
       'event.manage_participants','document.view','document.upload_personal','document.manage_shared',
       'document.delete','document.acknowledge','document.require_acknowledgement','document.request',
       'document.review_team','document.submit','onboarding.view','onboarding.complete',
       'onboarding.create','onboarding.delete','onboarding.template.manage','onboarding.template.delete',
       'employee.view_self','employee.view_all','employee.view_team','employee.create',
       'employee.edit','employee.deactivate','employee.offboard','department.view',
       'department.manage','department.delete','credential.submit','credential.verify',
       'credential.verify_team','credential.manage','credential.view_coverage','analytics.view_summary',
       'analytics.view_full','report.view_summary','report.view_full','organisation.settings',
       'user.role_management','payroll.manage','payroll.view_own'
     ], true),
    (org, 'Super Administrator', 'Full control, including editing its own role.', 'admin',
     array[
       'course.view','course.update_progress','course.create','course.edit',
       'course.delete','course.assign','course.bulk_assign','course.verify',
       'task.view','task.complete','task.create','task.edit',
       'task.delete','task.assign','task.bulk_assign','event.view',
       'event.rsvp','event.create','event.edit','event.delete',
       'event.manage_participants','document.view','document.upload_personal','document.manage_shared',
       'document.delete','document.acknowledge','document.require_acknowledgement','document.request',
       'document.review_team','document.submit','onboarding.view','onboarding.complete',
       'onboarding.create','onboarding.delete','onboarding.template.manage','onboarding.template.delete',
       'employee.view_self','employee.view_all','employee.view_team','employee.create',
       'employee.edit','employee.deactivate','employee.offboard','department.view',
       'department.manage','department.delete','credential.submit','credential.verify',
       'credential.verify_team','credential.manage','credential.view_coverage','analytics.view_summary',
       'analytics.view_full','report.view_summary','report.view_full','organisation.settings',
       'user.role_management','user.role_management_self',
       'payroll.manage','payroll.view_own'
     ], true)
  on conflict (organisation_id, name) do nothing;
$$;

-- Existing workspaces, including custom admin-tier roles.
update roles
   set permissions = array_append(permissions, 'payroll.manage')
 where base_role = 'admin' and not ('payroll.manage' = any (permissions));

update roles
   set permissions = array_append(permissions, 'payroll.view_own')
 where not ('payroll.view_own' = any (permissions));

-- And re-run it for every organisation already here, so the system roles match
-- the definition above rather than the one they were created from.
do $$
declare o uuid;
begin
  for o in select id from organisations loop
    perform ensure_system_roles(o);
  end loop;
end $$;
