-- Two things, because they are the same column set seen from both sides.
--
-- 1. An employee could edit *any* column of their own profile row. RLS is
--    row-level, not column-level, and `profile_update_self` says "your row" and
--    nothing about which fields. A PATCH of {"role":"admin"} against your own id
--    was accepted, and every capability check reads that column. That is
--    escalation in one request, with no admin screen involved.
--
-- 2. There was nowhere to record who to ring. An emergency contact is the one
--    piece of HR data whose absence is noticed at the worst possible moment, and
--    it is also the thing HR should never have to chase — the person owns it,
--    keeps it current, and can do so from a phone.

/*
 * Its own table, not three more columns on `profiles`.
 *
 * Profiles are readable across the workspace — that is the staff directory, and
 * it is meant to be. RLS is row-level, so a column added there is a column
 * every colleague can read, and "who to ring if something happens to me" is not
 * directory data. A separate table is the only way to give it a narrower rule
 * than the row it hangs off.
 */
create table emergency_contacts (
  user_id         uuid primary key references profiles(id) on delete cascade,
  organisation_id uuid not null references organisations(id) on delete cascade,
  name            text not null,
  relationship    text,
  phone           text not null,
  updated_at      timestamptz not null default now()
);

alter table emergency_contacts enable row level security;
alter table emergency_contacts force row level security;

-- The person and HR. Not the workspace, and not their line manager: a manager
-- who needs this in a real emergency is standing next to somebody in HR.
create policy emergency_contact_read on emergency_contacts for select to authenticated
  using (organisation_id = current_org_id() and (user_id = auth.uid() or is_admin()));

create policy emergency_contact_write on emergency_contacts for insert to authenticated
  with check (user_id = auth.uid() and organisation_id = current_org_id());

create policy emergency_contact_update on emergency_contacts for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy emergency_contact_clear on emergency_contacts for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.emergency_contacts to authenticated;

/*
 * What a person may change about themselves.
 *
 * Allowed: name, phone, avatar, and the emergency contact. Everything else is
 * an HR fact — who you report to, which department you sit in, what you are
 * paid to do, whether you still work here, and above all what you are allowed
 * to do — and is restored to its previous value if a self-edit touches it.
 *
 * Restoring rather than raising: a client that sends the whole row back (which
 * every ORM does) is not attacking anybody, and failing that request teaches
 * people to avoid the form. A request that *is* an attack achieves nothing
 * either way.
 */
create or replace function public.guard_profile_self_edit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is distinct from new.id or is_admin() then
    return new;
  end if;

  new.role            := old.role;
  new.role_id         := old.role_id;
  new.organisation_id := old.organisation_id;
  new.department_id   := old.department_id;
  new.manager_id      := old.manager_id;
  new.job_title       := old.job_title;
  new.start_date      := old.start_date;
  new.is_active       := old.is_active;
  -- Identity lives in auth.users; changing it here would only desynchronise
  -- the two.
  new.email           := old.email;

  return new;
end $$;

create trigger profiles_guard_self_edit
  before update on profiles
  for each row execute function public.guard_profile_self_edit();

/*
 * The same rule one tier up: an administrator promoting themselves is the same
 * move as an employee doing it, and `role` was guarded on `role_id` only.
 */
create or replace function public.guard_own_base_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.id = auth.uid()
     and new.role is distinct from old.role
     and not is_super_admin() then
    raise exception 'You cannot change your own access level. Ask a Super Administrator.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger profiles_guard_own_base_role
  before update of role on profiles
  for each row execute function public.guard_own_base_role();
