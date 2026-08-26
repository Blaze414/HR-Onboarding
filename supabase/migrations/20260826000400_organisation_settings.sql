-- Answering "are we a small business employer" by asking.
--
-- Section 23 counts employees of the employer *and of any associated entities*,
-- and counts casuals only where they are employed on a regular and systematic
-- basis. A workspace cannot know either of those from its own rows: associated
-- entities are not in this database, and whether a casual's pattern is regular
-- and systematic is a judgement about rosters.
--
-- So both are asked, once, in the organisation's settings — and the answer is
-- shown with its working, because a threshold that decides whether somebody
-- waits six months or twelve should not be a number that appears from nowhere.

create table organisation_settings (
  organisation_id uuid primary key references organisations(id) on delete cascade,
  -- Employees of associated entities, which count towards the threshold but
  -- are not in this workspace.
  associated_headcount integer not null default 0 check (associated_headcount >= 0),
  -- Whether any casual here works a regular and systematic pattern. Asked as a
  -- yes/no rather than per person: the answer that matters for the threshold is
  -- how many, and the per-person nuance belongs on the roster, not here.
  regular_casuals integer not null default 0 check (regular_casuals >= 0),
  -- An employer who knows the answer can say so, and say why. Used in
  -- preference to the count, because the count is an estimate of a legal test
  -- and the employer is the one who has to defend it.
  declared_small  boolean,
  declared_note   text,
  reviewed_at     timestamptz,
  reviewed_by     uuid references profiles(id) on delete set null,
  updated_at      timestamptz not null default now()
);

/*
 * Every organisation has a row, including ones created later.
 *
 * The backfill alone was not enough and failed silently: migrations run before
 * the seed, so at this point there may be no organisations at all, and a
 * workspace created afterwards would have had nowhere to record its answers.
 * A row that has never been answered is still the right starting state — it
 * says "never reviewed", which is true and worth showing.
 */
insert into organisation_settings (organisation_id)
select id from organisations
on conflict do nothing;

create or replace function public.create_organisation_settings() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into organisation_settings (organisation_id) values (new.id)
  on conflict do nothing;
  return new;
end $$;

create trigger organisations_get_settings
  after insert on organisations
  for each row execute function public.create_organisation_settings();

alter table organisation_settings enable row level security;
alter table organisation_settings force row level security;

-- Everybody can see it, because the answer changes what they are owed and when.
create policy org_settings_read on organisation_settings for select to authenticated
  using (organisation_id = current_org_id());

create policy org_settings_write on organisation_settings for update to authenticated
  using (organisation_id = current_org_id() and has_permission('organisation.settings'));

grant select, update on public.organisation_settings to authenticated;

create or replace function public.guard_org_settings() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.organisation_id := old.organisation_id;
  new.updated_at := now();
  new.reviewed_at := now();
  new.reviewed_by := auth.uid();
  return new;
end $$;

create trigger org_settings_guard
  before update on organisation_settings
  for each row execute function public.guard_org_settings();

-- ------------------------------------------------------------- the count
create or replace function public.employee_headcount(org uuid)
returns integer
language sql stable security definer set search_path = public as $$
  /*
   * Employees, for the purposes of the threshold.
   *
   * Contractors are not employees and are not counted. Casuals are excluded
   * here and added back from the settings, because the Act counts only those
   * employed on a regular and systematic basis and this table cannot tell.
   */
  select count(*)::integer
  from profiles
  where organisation_id = org
    and is_active
    and coalesce(employment_basis, 'Ongoing') not in ('Casual', 'Contract');
$$;

create or replace function public.is_small_business_employer(org uuid)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  s record;
  total integer;
begin
  select * into s from organisation_settings where organisation_id = org;

  -- An employer who has answered the question directly is taken at their word.
  -- They are the one who has to defend it, and they know about the entities
  -- and rosters this database has never seen.
  if s.declared_small is not null then
    return s.declared_small;
  end if;

  total := employee_headcount(org)
         + coalesce(s.regular_casuals, 0)
         + coalesce(s.associated_headcount, 0);

  return total < 15;
end $$;

grant execute on function public.employee_headcount(uuid) to authenticated;

/** The answer and its working, for a screen that has to explain itself. */
create view small_business_test with (security_invoker = on) as
select
  o.id as organisation_id,
  employee_headcount(o.id)                    as employees_here,
  coalesce(s.regular_casuals, 0)              as regular_casuals,
  coalesce(s.associated_headcount, 0)         as associated_headcount,
  employee_headcount(o.id) + coalesce(s.regular_casuals, 0) + coalesce(s.associated_headcount, 0) as counted,
  s.declared_small,
  s.declared_note,
  s.reviewed_at,
  r.name as reviewed_by_name,
  is_small_business_employer(o.id)            as is_small_business,
  (select count(*)::integer from profiles p
    where p.organisation_id = o.id and p.is_active and p.employment_basis = 'Casual') as casuals_here,
  (select count(*)::integer from profiles p
    where p.organisation_id = o.id and p.is_active and p.employment_basis = 'Contract') as contractors_here
from organisations o
left join organisation_settings s on s.organisation_id = o.id
left join profiles r on r.id = s.reviewed_by
where o.id = current_org_id();

grant select on public.small_business_test to authenticated;
