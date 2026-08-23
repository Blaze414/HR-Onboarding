-- When it was approved, and by whom, recorded by the database.
--
-- Both columns existed and both were optional in practice: the service set them,
-- and anything writing through PostgREST — a manager's own client, a script, a
-- future screen — could mark a record Verified with the timestamp left null. An
-- approval with no time on it cannot be placed in a sequence, which is the first
-- thing anybody asks when a decision is questioned: what was known, and when.
--
-- Stamping in the database rather than in each caller means every path records
-- it, including the ones not written yet.

create or replace function public.stamp_credential_approval() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Entering a decided state stamps the moment and the person, unless the
  -- caller supplied them explicitly.
  if new.status in ('Verified', 'Rejected')
     and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    new.verified_at := coalesce(new.verified_at, now());
    new.verified_by := coalesce(new.verified_by, auth.uid());
  end if;

  -- Leaving a decided state clears them: a timestamp left behind describes a
  -- decision that no longer stands.
  if new.status not in ('Verified', 'Rejected') then
    new.verified_at := null;
    new.verified_by := null;
  end if;

  return new;
end $$;

create trigger employee_credential_approval_stamp
before insert or update on employee_credentials
for each row execute function stamp_credential_approval();

create or replace function public.stamp_request_review() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('Accepted', 'Returned')
     and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    new.reviewed_at := coalesce(new.reviewed_at, now());
    new.reviewed_by := coalesce(new.reviewed_by, auth.uid());
  end if;

  -- A document sent back and returned again is under review afresh; the old
  -- decision's time does not describe the new submission.
  if new.status = 'Submitted' and old.status is distinct from 'Submitted' then
    new.reviewed_at := null;
    new.reviewed_by := null;
  end if;

  return new;
end $$;

create trigger document_request_review_stamp
before insert or update on document_requests
for each row execute function stamp_request_review();

/*
 * Training verification carries the same fact and had the same gap: the action
 * set the timestamp, and a direct write did not have to.
 */
create or replace function public.stamp_assignment_verification() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.verified_by is not null and new.verified_at is null then
    new.verified_at := now();
  end if;
  if new.verified_by is null then
    new.verified_at := null;
  end if;
  return new;
end $$;

create trigger course_assignment_verification_stamp
before insert or update on course_assignments
for each row execute function stamp_assignment_verification();

-- Anything already approved without a time gets the moment it was last touched,
-- which is the closest honest answer available.
update employee_credentials
   set verified_at = coalesce(verified_at, updated_at)
 where status in ('Verified', 'Rejected') and verified_at is null;

update document_requests
   set reviewed_at = coalesce(reviewed_at, updated_at)
 where status in ('Accepted', 'Returned') and reviewed_at is null;
