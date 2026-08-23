-- Explicit create / edit / delete.
--
-- Several destructive actions were guarded by the permission that grants
-- creation: a role allowed to add a task could also delete one, and a role
-- allowed to edit a course could archive it. Those are different decisions and
-- now carry different keys, so a role can be given one without the other.
--
-- Existing roles keep what they could already do. Every new key is granted to
-- the roles whose old permission already implied it, so this migration changes
-- what can be *expressed*, never what anyone can currently do.

-- Roles that could create could already delete; keep that true rather than
-- silently revoking access on deploy.
update roles set permissions = permissions || array['task.edit','task.delete']
 where 'task.create' = any (permissions) and not ('task.delete' = any (permissions));

update roles set permissions = permissions || array['course.delete']
 where 'course.edit' = any (permissions) and not ('course.delete' = any (permissions));

update roles set permissions = permissions || array['event.delete']
 where 'event.edit' = any (permissions) and not ('event.delete' = any (permissions));

update roles set permissions = permissions || array['onboarding.delete']
 where 'onboarding.create' = any (permissions) and not ('onboarding.delete' = any (permissions));

update roles set permissions = permissions || array['onboarding.template.delete']
 where 'onboarding.template.manage' = any (permissions)
   and not ('onboarding.template.delete' = any (permissions));

update roles set permissions = permissions || array['document.delete']
 where 'document.manage_shared' = any (permissions) and not ('document.delete' = any (permissions));

-- Departments were governed by the organisation settings permission, so that is
-- who inherits the new, narrower keys.
update roles set permissions = permissions || array['department.manage','department.delete']
 where 'organisation.settings' = any (permissions) and not ('department.manage' = any (permissions));

-- System roles are recreated with the full vocabulary so a new organisation
-- starts with the same shape as an upgraded one.
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
       'document.bulk_manage',
       'onboarding.view','onboarding.complete','onboarding.create','onboarding.delete',
       'onboarding.template.manage','onboarding.template.delete','onboarding.bulk_assign',
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
       'document.bulk_manage',
       'onboarding.view','onboarding.complete','onboarding.create','onboarding.delete',
       'onboarding.template.manage','onboarding.template.delete','onboarding.bulk_assign',
       'employee.view_self','employee.view_all','employee.create','employee.edit','employee.deactivate',
       'department.view','department.manage','department.delete',
       'analytics.view_summary','analytics.view_full',
       'report.view_summary','report.view_full','organisation.settings',
       'user.role_management','user.role_management_self'
     ], true)
  on conflict (organisation_id, name) do nothing;
$$;
