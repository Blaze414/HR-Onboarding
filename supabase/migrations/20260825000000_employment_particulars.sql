-- Employment particulars and record retention.
--
-- The Fair Work Act 2009 (s.535) and the Fair Work Regulations 2009 (reg 3.32)
-- require an employer to keep, for every employee, records of what kind of
-- employment it is: whether it is full-time or part-time, and whether it is
-- permanent, temporary or casual. This workspace held a job title and a start
-- date and neither of those two facts, so the record it produced could not be
-- a complete one. They are added here as columns rather than free text because
-- the rest of the app has to reason about them — who is casual decides who is
-- owed a Casual Employment Information Statement, and when.
--
-- Regulation 3.31 also requires records to be kept for seven years. The app
-- was hard-deleting personal documents from storage on request, which is the
-- opposite obligation, so deletion is closed here for anything that has become
-- a record.

create type employment_hours as enum ('Full-time', 'Part-time', 'Casual');
create type employment_basis as enum ('Ongoing', 'Fixed term', 'Casual');

alter table profiles
  add column employment_hours employment_hours,
  add column employment_basis employment_basis,
  -- The day employment ended. Kept on the record rather than implied by
  -- is_active, because "when did they leave" is itself a required particular.
  add column end_date date;

-- Casual is casual on both counts; anything else is a contradiction somebody
-- would have to resolve later, from memory.
alter table profiles add constraint profiles_casual_agrees
  check ((employment_hours = 'Casual') = (employment_basis = 'Casual'));

comment on column profiles.employment_hours is
  'Full-time, part-time or casual — Fair Work Regulations 2009 reg 3.32(c).';
comment on column profiles.employment_basis is
  'Ongoing, fixed term or casual — Fair Work Regulations 2009 reg 3.32(c).';

-- ------------------------------------------------------------------ retention
-- Seven years from the day the record was made, not from the day the person
-- left: reg 3.31 counts from the making of the record.
alter table documents
  add column retain_until date not null default (current_date + interval '7 years');

update documents set retain_until = (created_at::date + interval '7 years');

comment on column documents.retain_until is
  'Earliest day this may be destroyed — seven years, Fair Work Regulations 2009 reg 3.31.';

create or replace function public.guard_document_retention() returns trigger
language plpgsql as $$
begin
  /*
   * A shared document is published to the workspace, not a record of anybody's
   * employment, so it stays deletable. A personal document is a record.
   *
   * The day it was uploaded is left open so a file put on the wrong person can
   * be taken back off — a record that describes the wrong employee is a false
   * record, which reg 3.44 prohibits separately. After that day it stands.
   */
  if old.owner_id is not null
     and old.created_at::date < current_date
     and old.retain_until > current_date then
    raise exception
      'This is an employment record and must be kept until %. Records cannot be deleted before then.',
      to_char(old.retain_until, 'FMDD Mon YYYY')
      using errcode = 'check_violation';
  end if;
  return old;
end $$;

create trigger documents_guard_retention
  before delete on documents
  for each row execute function public.guard_document_retention();

create or replace function public.guard_retention_period() returns trigger
language plpgsql as $$
begin
  /*
   * A retention period that can be shortened is not a retention period: set it
   * to yesterday and the delete guard above waves the record through. It may
   * still be pushed out — a record held for a dispute is kept longer, never
   * less — so the later of the two dates wins.
   */
  new.retain_until := greatest(new.retain_until, old.retain_until);
  return new;
end $$;

create trigger documents_guard_retention_period
  before update on documents
  for each row execute function public.guard_retention_period();

-- The self-service guard predates these columns. An employee editing their own
-- profile must not be able to move themselves off casual — that changes what
-- the employer owes them and what the record says.
create or replace function public.guard_profile_self_edit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is distinct from new.id or is_admin() then return new; end if;
  new.role := old.role; new.role_id := old.role_id;
  new.organisation_id := old.organisation_id; new.department_id := old.department_id;
  new.manager_id := old.manager_id; new.job_title := old.job_title;
  new.start_date := old.start_date; new.is_active := old.is_active;
  new.email := old.email;
  new.employment_hours := old.employment_hours;
  new.employment_basis := old.employment_basis;
  new.end_date := old.end_date;
  return new;
end $$;
