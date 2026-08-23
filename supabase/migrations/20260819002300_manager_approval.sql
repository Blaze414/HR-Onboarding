-- Managers approve their own team's paperwork.
--
-- Checking a certificate usually means somebody sighting the original, and the
-- person standing next to the employee is their manager, not HR. Routing every
-- check through one desk is how a queue of first aid certificates builds up
-- while nobody can be rostered.
--
-- Two limits, both deliberate:
--   * a manager checks their own reports, nobody else's;
--   * sensitive kinds — the ones holding identity documents — stay with whoever
--     holds `credential.verify`. A manager has no business reading a
--     colleague's passport to confirm a forklift licence.

create policy credential_verify_team on employee_credentials for update to authenticated
  using (
    organisation_id = current_org_id()
    and is_manager_of(employee_id)
    and has_permission('credential.verify_team')
    and not exists (
      select 1 from credential_types t
       where t.id = credential_type_id and t.is_sensitive
    )
  )
  with check (
    organisation_id = current_org_id()
    and is_manager_of(employee_id)
    and has_permission('credential.verify_team')
  );

/*
 * The column guard has to recognise the manager as a verifier too, or their
 * verdict is silently reverted the moment they record it.
 */
create or replace function public.guard_credential_columns() returns trigger
language plpgsql security definer set search_path = public as $$
declare may_verify boolean;
begin
  if auth.uid() is null then
    return new;
  end if;

  may_verify := has_permission('credential.verify')
    or (
      has_permission('credential.verify_team')
      and is_manager_of(old.employee_id)
      and not exists (
        select 1 from credential_types t where t.id = old.credential_type_id and t.is_sensitive
      )
    );

  if may_verify then
    return new;
  end if;

  new.status              := old.status;
  new.verified_by         := old.verified_by;
  new.verified_at         := old.verified_at;
  new.review_note         := old.review_note;
  new.employee_id         := old.employee_id;
  new.verification_method := old.verification_method;
  new.original_sighted    := old.original_sighted;

  if new.title is distinct from old.title
     or new.expires_on is distinct from old.expires_on
     or new.document_id is distinct from old.document_id then
    new.status      := 'Pending';
    new.verified_by := null;
    new.verified_at := null;
    new.verification_method := null;
    new.original_sighted    := false;
  end if;

  return new;
end $$;

-- ---------------------------------------------------------------- documents
/*
 * The same for returned documents: a manager accepts what their own team sent
 * back. The employee still cannot decide their own outcome — that guard is
 * unchanged and applies to everybody who is not a reviewer.
 */
create policy request_review_team on document_requests for update to authenticated
  using (organisation_id = current_org_id()
         and is_manager_of(employee_id)
         and has_permission('document.review_team'))
  with check (organisation_id = current_org_id()
         and is_manager_of(employee_id)
         and has_permission('document.review_team'));

create or replace function public.guard_document_request_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null
     or has_permission('document.request')
     or (has_permission('document.review_team') and is_manager_of(old.employee_id)) then
    return new;
  end if;

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

-- Everyone gains the team-review keys; they only do anything for people who
-- actually manage somebody.
update roles set permissions = permissions || array['credential.verify_team','document.review_team']
 where not ('credential.verify_team' = any (permissions));
