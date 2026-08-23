-- Removes two permissions that granted nothing.
--
-- `document.bulk_manage` and `onboarding.bulk_assign` had no feature behind
-- them: no screen offered bulk document management, and onboarding is started
-- one person at a time. A role could tick them and nothing changed, which is
-- worse than the permission not existing — it implies a control that is not
-- there.
--
-- The keys are dropped from every role rather than left as dead data, so what
-- the database stores matches what the application can actually check.
update roles
   set permissions = array_remove(
         array_remove(permissions, 'document.bulk_manage'),
         'onboarding.bulk_assign')
 where 'document.bulk_manage' = any (permissions)
    or 'onboarding.bulk_assign' = any (permissions);

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
       'course.view','course.update_progress','course.create','course.edit','course.delete',
       'course.assign','course.bulk_assign',
       'task.view','task.complete','task.create','task.edit','task.delete',
       'task.assign','task.bulk_assign',
       'event.view','event.rsvp','event.create','event.edit','event.delete','event.manage_participants',
       'document.view','document.upload_personal','document.manage_shared','document.delete',
       'onboarding.view','onboarding.complete','onboarding.create','onboarding.delete',
       'onboarding.template.manage','onboarding.template.delete',
       'employee.view_self','employee.view_all','employee.create','employee.edit','employee.deactivate',
       'department.view','department.manage','department.delete',
       'analytics.view_summary','analytics.view_full',
       'report.view_summary','report.view_full','organisation.settings','user.role_management'
     ], true),
    (org, 'Super Administrator', 'Full control, including editing its own role.', 'admin',
     array[
       'course.view','course.update_progress','course.create','course.edit','course.delete',
       'course.assign','course.bulk_assign',
       'task.view','task.complete','task.create','task.edit','task.delete',
       'task.assign','task.bulk_assign',
       'event.view','event.rsvp','event.create','event.edit','event.delete','event.manage_participants',
       'document.view','document.upload_personal','document.manage_shared','document.delete',
       'onboarding.view','onboarding.complete','onboarding.create','onboarding.delete',
       'onboarding.template.manage','onboarding.template.delete',
       'employee.view_self','employee.view_all','employee.create','employee.edit','employee.deactivate',
       'department.view','department.manage','department.delete',
       'analytics.view_summary','analytics.view_full',
       'report.view_summary','report.view_full','organisation.settings',
       'user.role_management','user.role_management_self'
     ], true)
  on conflict (organisation_id, name) do nothing;
$$;
