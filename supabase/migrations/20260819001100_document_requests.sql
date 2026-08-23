-- Asking someone for a document, and getting it back.
--
-- The scenario this is built around: HR uploads an unsigned contract, the
-- employee sees it, downloads it, signs it, and returns the signed copy. The
-- same shape covers every other thing HR chases — a certificate, a bank form, a
-- right-to-work document — so it is one mechanism rather than a signing feature
-- and four workarounds.
--
-- Both files are ordinary rows in `documents`, so storage, permissions and
-- download all behave the way they already do. What is new is the request that
-- ties them together and states who owes what.

create type document_request_status as enum ('Requested', 'Submitted', 'Accepted', 'Returned');

create table document_requests (
  id                    uuid primary key default gen_random_uuid(),
  organisation_id       uuid not null references organisations(id) on delete cascade,
  employee_id           uuid not null references profiles(id) on delete cascade,
  requested_by          uuid references profiles(id) on delete set null,
  title                 text not null,
  instructions          text,
  -- What to download, sign, or fill in. Optional: some requests are simply
  -- "send us your certificate".
  template_document_id  uuid references documents(id) on delete set null,
  -- What came back.
  submitted_document_id uuid references documents(id) on delete set null,
  -- Ties the request to a step in a joining or leaving plan, so the plan shows
  -- as incomplete until the paperwork is actually in.
  onboarding_step_id    uuid references onboarding_steps(id) on delete set null,
  due_date              date,
  status                document_request_status not null default 'Requested',
  submitted_at          timestamptz,
  reviewed_by           uuid references profiles(id) on delete set null,
  reviewed_at           timestamptz,
  -- Why it was sent back. The single most useful field when a signature is
  -- missing and nobody remembers what was wrong with it.
  review_note           text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index on document_requests (organisation_id, status);
create index on document_requests (employee_id, status);

create trigger document_requests_set_updated_at before update on document_requests
for each row execute function set_updated_at();

alter table document_requests enable row level security;
alter table document_requests force row level security;

-- You see what is asked of you. An administrator sees the workspace. A manager
-- sees their own team, because chasing paperwork is the job.
create policy request_read on document_requests for select to authenticated
  using (organisation_id = current_org_id()
         and (is_admin() or employee_id = auth.uid() or is_manager_of(employee_id)));

create policy request_admin_write on document_requests for all to authenticated
  using (organisation_id = current_org_id() and is_admin() and has_permission('document.request'))
  with check (organisation_id = current_org_id() and is_admin() and has_permission('document.request'));

-- The employee returns the document. They may attach their file and nothing
-- else; accepting or rejecting it is somebody else's decision.
create policy request_submit_own on document_requests for update to authenticated
  using (organisation_id = current_org_id() and employee_id = auth.uid())
  with check (organisation_id = current_org_id() and employee_id = auth.uid());

grant select, insert, update, delete on public.document_requests to authenticated;

/*
 * Employees may submit, not decide.
 *
 * Row Level Security cannot express "these columns only", and the same gap that
 * let a learner verify their own training would let an employee mark their own
 * paperwork Accepted.
 */
create or replace function public.guard_document_request_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or has_permission('document.request') then
    return new;
  end if;

  -- Everything the requester decided stays as they left it.
  new.title                := old.title;
  new.instructions         := old.instructions;
  new.template_document_id := old.template_document_id;
  new.onboarding_step_id   := old.onboarding_step_id;
  new.due_date             := old.due_date;
  new.employee_id          := old.employee_id;
  new.requested_by         := old.requested_by;
  new.reviewed_by          := old.reviewed_by;
  new.reviewed_at          := old.reviewed_at;
  new.review_note          := old.review_note;

  -- Returning a document is the one move an employee can make. Anything else
  -- leaves the status alone.
  if new.submitted_document_id is distinct from old.submitted_document_id
     and new.submitted_document_id is not null then
    new.status := 'Submitted';
    new.submitted_at := now();
  else
    new.status := old.status;
    new.submitted_at := old.submitted_at;
  end if;

  return new;
end $$;

create trigger document_request_column_guard
before update on document_requests
for each row execute function guard_document_request_columns();

/*
 * A manager can read the files their team returned, and the templates they were
 * asked to sign. Without this the request is visible and the document attached
 * to it is not, which is the same as not having it.
 */
create policy document_read_team on documents for select to authenticated
  using (organisation_id = current_org_id() and owner_id is not null and is_manager_of(owner_id));

-- Everyone can see what is outstanding, one row per request.
create view outstanding_document_requests with (security_invoker = on) as
select
  r.id            as request_id,
  r.organisation_id,
  r.title,
  r.due_date,
  r.status,
  p.id            as employee_id,
  p.name          as employee_name,
  p.email         as employee_email,
  p.department_id,
  d.name          as department_name,
  m.name          as manager_name,
  (r.due_date is not null and r.due_date < current_date) as is_overdue
from document_requests r
join profiles p on p.id = r.employee_id
left join departments d on d.id = p.department_id
left join profiles   m on m.id = p.manager_id
where r.status in ('Requested', 'Returned')
  and p.is_active;

grant select on outstanding_document_requests to authenticated;
