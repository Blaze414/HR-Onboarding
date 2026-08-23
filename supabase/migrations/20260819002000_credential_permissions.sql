-- Restates the system roles against the capability list the code enforces,
-- now including the credential permissions.
create or replace function ensure_system_roles(org uuid) returns void
language sql as $$
  insert into roles (organisation_id, name, description, base_role, permissions, is_system)
  values
    (org, 'Employee', 'Day-to-day access to your own work.', 'employee',
     array[
       'course.view','course.update_progress','task.view','task.complete',
       'event.view','event.rsvp','document.view','document.upload_personal',
       'document.acknowledge','document.submit','onboarding.view','onboarding.complete',
       'employee.view_self','employee.view_team','credential.submit','report.view_summary'
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
       'document.submit','onboarding.view','onboarding.complete','onboarding.create',
       'onboarding.delete','onboarding.template.manage','onboarding.template.delete','employee.view_self',
       'employee.view_all','employee.view_team','employee.create','employee.edit',
       'employee.deactivate','employee.offboard','department.view','department.manage',
       'department.delete','credential.submit','credential.verify','credential.manage',
       'credential.view_coverage','analytics.view_summary','analytics.view_full','report.view_summary',
       'report.view_full','organisation.settings','user.role_management'
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
       'document.submit','onboarding.view','onboarding.complete','onboarding.create',
       'onboarding.delete','onboarding.template.manage','onboarding.template.delete','employee.view_self',
       'employee.view_all','employee.view_team','employee.create','employee.edit',
       'employee.deactivate','employee.offboard','department.view','department.manage',
       'department.delete','credential.submit','credential.verify','credential.manage',
       'credential.view_coverage','analytics.view_summary','analytics.view_full','report.view_summary',
       'report.view_full','organisation.settings','user.role_management','user.role_management_self',
       'user.role_management_self'
     ], true)
  on conflict (organisation_id, name) do nothing;
$$;

-- Existing roles keep what they had and gain the new keys their tier implies.
update roles set permissions = permissions || array['credential.submit']
 where not ('credential.submit' = any (permissions));

update roles set permissions = permissions
      || array['credential.verify','credential.manage','credential.view_coverage']
 where 'employee.view_all' = any (permissions)
   and not ('credential.verify' = any (permissions));
