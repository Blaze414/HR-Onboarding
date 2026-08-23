-- Grants the new permissions to the roles that already imply them, and seeds an
-- offboarding template so the machinery has something to run.

-- Everyone can acknowledge a document they have been given; that is the whole
-- point of the record.
update roles set permissions = permissions || array['document.acknowledge','employee.view_team']
 where not ('document.acknowledge' = any (permissions));

-- Requiring an acknowledgement, verifying training and running an exit plan are
-- administrative acts, so they follow the permissions that already cover
-- managing documents, assigning courses and deactivating people.
update roles set permissions = permissions || array['document.require_acknowledgement']
 where 'document.manage_shared' = any (permissions)
   and not ('document.require_acknowledgement' = any (permissions));

update roles set permissions = permissions || array['course.verify']
 where 'course.assign' = any (permissions) and not ('course.verify' = any (permissions));

update roles set permissions = permissions || array['employee.offboard']
 where 'employee.deactivate' = any (permissions) and not ('employee.offboard' = any (permissions));

create or replace function ensure_system_roles(org uuid) returns void
language sql as $$
  insert into roles (organisation_id, name, description, base_role, permissions, is_system)
  values
    (org, 'Employee', 'Day-to-day access to your own work.', 'employee',
     array[
       'course.view','course.update_progress','task.view','task.complete','event.view','event.rsvp',
       'document.view','document.upload_personal','document.acknowledge',
       'onboarding.view','onboarding.complete',
       'employee.view_self','employee.view_team','report.view_summary'
     ], true),
    (org, 'Administrator', 'Manages the workspace. Cannot edit its own role.', 'admin',
     array[
       'course.view','course.update_progress','course.create','course.edit','course.delete',
       'course.assign','course.bulk_assign','course.verify',
       'task.view','task.complete','task.create','task.edit','task.delete',
       'task.assign','task.bulk_assign',
       'event.view','event.rsvp','event.create','event.edit','event.delete','event.manage_participants',
       'document.view','document.upload_personal','document.manage_shared','document.delete',
       'document.acknowledge','document.require_acknowledgement',
       'onboarding.view','onboarding.complete','onboarding.create','onboarding.delete',
       'onboarding.template.manage','onboarding.template.delete',
       'employee.view_self','employee.view_all','employee.view_team','employee.create',
       'employee.edit','employee.deactivate','employee.offboard',
       'department.view','department.manage','department.delete',
       'analytics.view_summary','analytics.view_full',
       'report.view_summary','report.view_full','organisation.settings','user.role_management'
     ], true),
    (org, 'Super Administrator', 'Full control, including editing its own role.', 'admin',
     array[
       'course.view','course.update_progress','course.create','course.edit','course.delete',
       'course.assign','course.bulk_assign','course.verify',
       'task.view','task.complete','task.create','task.edit','task.delete',
       'task.assign','task.bulk_assign',
       'event.view','event.rsvp','event.create','event.edit','event.delete','event.manage_participants',
       'document.view','document.upload_personal','document.manage_shared','document.delete',
       'document.acknowledge','document.require_acknowledgement',
       'onboarding.view','onboarding.complete','onboarding.create','onboarding.delete',
       'onboarding.template.manage','onboarding.template.delete',
       'employee.view_self','employee.view_all','employee.view_team','employee.create',
       'employee.edit','employee.deactivate','employee.offboard',
       'department.view','department.manage','department.delete',
       'analytics.view_summary','analytics.view_full',
       'report.view_summary','report.view_full','organisation.settings',
       'user.role_management','user.role_management_self'
     ], true)
  on conflict (organisation_id, name) do nothing;
$$;
