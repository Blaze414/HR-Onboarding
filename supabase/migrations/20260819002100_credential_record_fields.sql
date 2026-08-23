-- The fields a credential record needs to stand up when somebody checks it.
--
-- What was stored was enough to file a certificate and not enough to defend a
-- rostering decision. Each field below exists because of a question that gets
-- asked afterwards and cannot be answered from a title and an expiry date.

alter table credential_types
  -- A three-year certificate needs longer notice than an annual one; a single
  -- global window either nags for months or warns too late to rebook.
  add column renewal_notice_days int not null default 60,
  -- Some kinds hold identity documents — a passport scan is not a first aid
  -- certificate, and should not be as widely readable.
  add column is_sensitive boolean not null default false,
  -- What a checker should look at to confirm it. Written once per kind rather
  -- than remembered by whoever happens to be reviewing.
  add column verification_guidance text;

alter table credential_department_coverage
  /*
   * Whether this credential is *required* to work in that department, or merely
   * qualifies somebody for it. Rostering treats the two very differently: a
   * person missing an enabling credential is a narrower option, a person missing
   * a required one cannot be placed there at all.
   */
  add column is_required boolean not null default false;

alter table employee_credentials
  -- The number on the certificate. Without it nobody can re-check the thing
  -- against the body that issued it, which makes every later verification a
  -- matter of trusting the first one.
  add column reference_number text,
  -- Where it was issued. A licence valid in one state is not automatically valid
  -- in another, and "valid" with no jurisdiction is not a fact.
  add column jurisdiction text,
  -- Conditions printed on the credential: a class restriction, a supervision
  -- requirement, corrective lenses. Rostering against an unread restriction is
  -- the failure this prevents.
  add column conditions text,
  -- How it was checked. "Verified" on its own is an unfalsifiable claim; this
  -- records what the verifier actually did.
  add column verification_method text,
  -- Whether the original was seen, or only a copy or photograph.
  add column original_sighted boolean not null default false;

comment on column employee_credentials.verification_method is
  'How the credential was checked: original sighted, issuing register checked, copy only.';

/*
 * A verifier has to say how they checked.
 *
 * Marking something Verified with no method recorded is the same as marking it
 * verified because it looked plausible — and it is the first thing questioned
 * when a placement is challenged.
 */
create or replace function public.guard_credential_verification() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'Verified' and coalesce(trim(new.verification_method), '') = '' then
    raise exception 'Record how this credential was checked before marking it verified.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger employee_credential_verification_guard
before insert or update on employee_credentials
for each row execute function guard_credential_verification();

/*
 * Expiry now follows the kind's own notice period rather than a fixed window,
 * and states whether the person is losing something a department requires.
 */
drop view expiring_credentials;

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
  (c.expires_on < current_date) as has_expired,
  -- Whether losing this closes a department to them entirely.
  exists (
    select 1 from credential_department_coverage cov
     where cov.credential_type_id = c.credential_type_id and cov.is_required
  )               as blocks_a_department
from employee_credentials c
join profiles p on p.id = c.employee_id
left join credential_types t on t.id = c.credential_type_id
left join departments d on d.id = p.department_id
left join profiles   m on m.id = p.manager_id
where c.expires_on is not null
  and c.status in ('Verified', 'Expired')
  and c.expires_on <= current_date + coalesce(t.renewal_notice_days, 60)
  and p.is_active;

grant select on expiring_credentials to authenticated;

-- Coverage states whether the credential is required for that department or
-- merely opens it up.
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
  cov.is_required
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
