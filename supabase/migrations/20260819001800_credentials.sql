-- Optional documents and certifications, and what they qualify somebody for.
--
-- Staff can already be *asked* for a document. This is the other direction: a
-- person offering something nobody requested — a first aid certificate, a
-- forklift licence, a second language. HR's question is never "do we have the
-- PDF"; it is "who could I roster into Operations on Thursday". A pile of files
-- named cert.pdf cannot answer that.
--
-- Three things make it answerable:
--   1. the credential says what kind of thing it is, not just its filename;
--   2. a kind is linked to the departments it qualifies somebody for;
--   3. it carries an expiry, because an expired certificate is worse than a
--      missing one — the roster assumes it is valid.

create type credential_status as enum ('Pending', 'Verified', 'Rejected', 'Expired');

/*
 * The kinds of credential this workspace recognises, and what each one opens up.
 * Free-text certificates would leave HR reading titles and guessing; a named
 * kind is what makes coverage a query rather than an afternoon.
 */
create table credential_types (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  name            text not null,
  description     text,
  -- Whether a certificate of this kind must state when it runs out. A first aid
  -- certificate without an expiry is not a first aid certificate.
  requires_expiry boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (organisation_id, name)
);

/*
 * Which departments a kind of credential qualifies somebody to cover. Many to
 * many on purpose: a first aid certificate is useful in more than one place, and
 * a department usually accepts more than one qualification.
 */
create table credential_department_coverage (
  credential_type_id uuid not null references credential_types(id) on delete cascade,
  department_id      uuid not null references departments(id) on delete cascade,
  organisation_id    uuid not null references organisations(id) on delete cascade,
  primary key (credential_type_id, department_id)
);

create table employee_credentials (
  id                 uuid primary key default gen_random_uuid(),
  organisation_id    uuid not null references organisations(id) on delete cascade,
  employee_id        uuid not null references profiles(id) on delete cascade,
  credential_type_id uuid references credential_types(id) on delete set null,
  -- Kept even when a kind is chosen: certificates have names, and HR reads them.
  title              text not null,
  issuer             text,
  issued_on          date,
  expires_on         date,
  -- The scan or photo, stored as an ordinary document owned by the employee.
  document_id        uuid references documents(id) on delete set null,
  status             credential_status not null default 'Pending',
  verified_by        uuid references profiles(id) on delete set null,
  verified_at        timestamptz,
  review_note        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index on employee_credentials (organisation_id, status);
create index on employee_credentials (employee_id);
create index on employee_credentials (expires_on) where expires_on is not null;

create trigger employee_credentials_set_updated_at before update on employee_credentials
for each row execute function set_updated_at();

alter table credential_types                 enable row level security;
alter table credential_types                 force row level security;
alter table credential_department_coverage   enable row level security;
alter table credential_department_coverage   force row level security;
alter table employee_credentials             enable row level security;
alter table employee_credentials             force row level security;

-- Everyone can see what kinds exist: a person cannot offer a qualification they
-- do not know is wanted.
create policy credential_type_read on credential_types for select to authenticated
  using (organisation_id = current_org_id());
create policy credential_type_write on credential_types for all to authenticated
  using (organisation_id = current_org_id() and is_admin() and has_permission('credential.manage'))
  with check (organisation_id = current_org_id() and is_admin() and has_permission('credential.manage'));

create policy coverage_read on credential_department_coverage for select to authenticated
  using (organisation_id = current_org_id());
create policy coverage_write on credential_department_coverage for all to authenticated
  using (organisation_id = current_org_id() and is_admin() and has_permission('credential.manage'))
  with check (organisation_id = current_org_id() and is_admin() and has_permission('credential.manage'));

-- Your own credentials, your team's if you manage them, everyone's if you run
-- the workspace.
create policy credential_read on employee_credentials for select to authenticated
  using (organisation_id = current_org_id()
         and (is_admin() or employee_id = auth.uid() or is_manager_of(employee_id)));

create policy credential_submit_own on employee_credentials for insert to authenticated
  with check (organisation_id = current_org_id() and employee_id = auth.uid());

create policy credential_update_own on employee_credentials for update to authenticated
  using (organisation_id = current_org_id() and employee_id = auth.uid())
  with check (organisation_id = current_org_id() and employee_id = auth.uid());

create policy credential_admin_write on employee_credentials for all to authenticated
  using (organisation_id = current_org_id() and is_admin() and has_permission('credential.verify'))
  with check (organisation_id = current_org_id() and is_admin() and has_permission('credential.verify'));

grant select, insert, update, delete on public.credential_types to authenticated;
grant select, insert, update, delete on public.credential_department_coverage to authenticated;
grant select, insert, update, delete on public.employee_credentials to authenticated;

/*
 * A person may offer and correct their own credential; they may not declare it
 * checked. Same column-level gap as everywhere else — the row is theirs, the
 * verdict is not.
 */
create or replace function public.guard_credential_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or has_permission('credential.verify') then
    return new;
  end if;

  new.status      := old.status;
  new.verified_by := old.verified_by;
  new.verified_at := old.verified_at;
  new.review_note := old.review_note;
  new.employee_id := old.employee_id;

  -- Editing the substance of a checked credential quietly un-checks it: the
  -- verdict was about the old details.
  if new.title is distinct from old.title
     or new.expires_on is distinct from old.expires_on
     or new.document_id is distinct from old.document_id then
    new.status      := 'Pending';
    new.verified_by := null;
    new.verified_at := null;
  end if;

  return new;
end $$;

create trigger employee_credential_column_guard
before update on employee_credentials
for each row execute function guard_credential_columns();
