-- Learners may move their own progress, and nothing else.
--
-- Row Level Security decides which *rows* a person may write, not which columns.
-- `assignment_update_own` lets a learner update their own assignment, which was
-- intended to mean "record how far through you are" and actually meant "rewrite
-- this row". A learner could mark their own required training verified, clear
-- the requirement, or move their own deadline.
--
-- Postgres has column-level grants, but they cannot express "except on your own
-- row", so the rule is enforced where it can see both the old and new values.

create or replace function public.guard_assignment_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- No authenticated user means this is not a learner: migrations, seeds and the
  -- service role all write without a session, and they are trusted by
  -- definition. Without this branch the guard silently reverts their writes,
  -- which is far worse than refusing them — the statement reports success and
  -- the change simply does not happen.
  if auth.uid() is null then
    return new;
  end if;

  -- Anyone allowed to assign or verify is acting administratively; the whole row
  -- is theirs to change.
  if has_permission('course.assign') or has_permission('course.verify') then
    return new;
  end if;

  -- Everyone else is a learner touching their own record. Their own figures are
  -- theirs to move; every fact *about* the assignment is preserved as it was.
  new.is_required  := old.is_required;
  new.due_date     := old.due_date;
  new.assigned_by  := old.assigned_by;
  new.user_id      := old.user_id;
  new.course_id    := old.course_id;
  new.verified_at  := old.verified_at;
  new.verified_by  := old.verified_by;

  return new;
end $$;

create trigger course_assignment_column_guard
before update on course_assignments
for each row execute function guard_assignment_columns();
