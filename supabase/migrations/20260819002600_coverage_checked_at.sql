-- Coverage states when the credential behind it was checked.
--
-- "Charlie can cover Operations" rests on somebody having verified a certificate.
-- Whether that happened last week or two years ago changes how much weight the
-- statement carries, and the roster is where that matters.
drop view department_coverage;

create view department_coverage with (security_invoker = on) as
select
  c.organisation_id,
  d.id            as department_id,
  d.name          as department_name,
  p.id            as employee_id,
  p.name          as employee_name,
  p.job_title,
  home.name       as home_department,
  t.id            as credential_type_id,
  t.name          as credential_name,
  c.title         as credential_title,
  c.expires_on,
  c.conditions,
  cov.is_required,
  c.verified_at,
  v.name          as verified_by_name,
  c.verification_method
from employee_credentials c
join credential_types t on t.id = c.credential_type_id
join credential_department_coverage cov on cov.credential_type_id = t.id
join departments d on d.id = cov.department_id
join profiles p on p.id = c.employee_id
left join departments home on home.id = p.department_id
left join profiles   v on v.id = c.verified_by
where c.status = 'Verified'
  and (c.expires_on is null or c.expires_on >= current_date)
  and p.is_active
  and (p.department_id is null or p.department_id <> d.id);

grant select on department_coverage to authenticated;
