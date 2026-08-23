-- The question HR actually asks.

/*
 * Who could cover which department, and on the strength of what.
 *
 * Only verified, unexpired credentials count. A self-declared certificate is a
 * claim, and an expired one is a claim that used to be true — rostering on
 * either is how somebody ends up on shift without the qualification the shift
 * required. Both are still visible elsewhere; they are simply not coverage.
 *
 * A person's own department is excluded: HR is asking where somebody could go
 * *in addition*, not where they already work.
 */
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
  c.expires_on
from employee_credentials c
join credential_types t on t.id = c.credential_type_id
join credential_department_coverage cov on cov.credential_type_id = t.id
join departments d on d.id = cov.department_id
join profiles p on p.id = c.employee_id
left join departments home on home.id = p.department_id
where c.status = 'Verified'
  and (c.expires_on is null or c.expires_on >= current_date)
  and p.is_active
  and (p.department_id is null or p.department_id <> d.id);

grant select on department_coverage to authenticated;

/*
 * Credentials that have run out, or are about to.
 *
 * Sixty days is the window in which most requalification can still be booked;
 * after it lapses the person silently drops out of coverage and the roster is
 * the last place anybody finds out.
 */
create view expiring_credentials with (security_invoker = on) as
select
  c.id            as credential_id,
  c.organisation_id,
  p.id            as employee_id,
  p.name          as employee_name,
  p.email         as employee_email,
  m.name          as manager_name,
  d.name          as department_name,
  coalesce(t.name, c.title) as credential_name,
  c.expires_on,
  (c.expires_on - current_date) as days_left,
  (c.expires_on < current_date) as has_expired
from employee_credentials c
join profiles p on p.id = c.employee_id
left join credential_types t on t.id = c.credential_type_id
left join departments d on d.id = p.department_id
left join profiles   m on m.id = p.manager_id
where c.expires_on is not null
  and c.status in ('Verified', 'Expired')
  and c.expires_on <= current_date + 60
  and p.is_active;

grant select on expiring_credentials to authenticated;

/*
 * Marks lapsed credentials as expired.
 *
 * Nothing happens in a database when a date passes, so without this a lapsed
 * certificate keeps its Verified stamp forever and only the views know better.
 * Called by the same sweep that chases training deadlines, and it also tells the
 * person and their manager — a certificate that lapses silently is the failure
 * this whole feature exists to prevent.
 */
create or replace function public.expire_credentials()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  org uuid := current_org_id();
  changed integer := 0;
  row record;
begin
  if org is null then return 0; end if;

  for row in
    select c.id, c.employee_id, coalesce(t.name, c.title) as label, c.expires_on, p.manager_id
      from employee_credentials c
      join profiles p on p.id = c.employee_id
      left join credential_types t on t.id = c.credential_type_id
     where c.organisation_id = org
       and c.status = 'Verified'
       and c.expires_on is not null
       and c.expires_on < current_date
  loop
    update employee_credentials set status = 'Expired' where id = row.id;
    changed := changed + 1;

    perform notify(
      org, row.employee_id, null, 'course_overdue',
      row.label || ' has expired',
      'It lapsed on ' || to_char(row.expires_on, 'FMDay DD FMMonth') || '. Upload the renewed certificate.',
      '/profile', row.id
    );

    if row.manager_id is not null then
      perform notify(
        org, row.manager_id, null, 'report_overdue',
        row.label || ' has expired',
        'They drop out of cover for it until it is renewed.',
        '/employees/' || row.employee_id, row.id
      );
    end if;
  end loop;

  return changed;
end $$;

grant execute on function public.expire_credentials() to authenticated;
