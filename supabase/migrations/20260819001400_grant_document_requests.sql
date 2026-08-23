-- Requesting documents follows the permission that already manages shared
-- documents; returning one is everybody's.
update roles set permissions = permissions || array['document.submit']
 where not ('document.submit' = any (permissions));

update roles set permissions = permissions || array['document.request']
 where 'document.manage_shared' = any (permissions)
   and not ('document.request' = any (permissions));
