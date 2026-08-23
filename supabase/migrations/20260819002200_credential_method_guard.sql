-- The verifier owns the verification fields, not the subject.
--
-- The column guard preserved the verdict but not the account of how it was
-- reached, so an employee could write "Original sighted" on their own record.
-- A verifier then sees a filled-in method and a plausible certificate, and the
-- one field that makes the check auditable was written by the person being
-- checked.

create or replace function public.guard_credential_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or has_permission('credential.verify') then
    return new;
  end if;

  new.status              := old.status;
  new.verified_by         := old.verified_by;
  new.verified_at         := old.verified_at;
  new.review_note         := old.review_note;
  new.employee_id         := old.employee_id;
  -- How it was checked, and whether the original was seen, are the verifier's
  -- account of their own work. The subject of the record cannot write them.
  new.verification_method := old.verification_method;
  new.original_sighted    := old.original_sighted;

  if new.title is distinct from old.title
     or new.expires_on is distinct from old.expires_on
     or new.document_id is distinct from old.document_id then
    new.status      := 'Pending';
    new.verified_by := null;
    new.verified_at := null;
    -- The account described the old details, so it goes with them.
    new.verification_method := null;
    new.original_sighted    := false;
  end if;

  return new;
end $$;

/*
 * Nobody may create a record that is already verified, either. Insert had no
 * guard at all, so the whole check above could be sidestepped by submitting a
 * finished-looking credential in the first place.
 */
create or replace function public.guard_credential_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or has_permission('credential.verify') then
    return new;
  end if;
  new.status              := 'Pending';
  new.verified_by         := null;
  new.verified_at         := null;
  new.verification_method := null;
  new.original_sighted    := false;
  new.review_note         := null;
  return new;
end $$;

create trigger employee_credential_insert_guard
before insert on employee_credentials
for each row execute function guard_credential_insert();
