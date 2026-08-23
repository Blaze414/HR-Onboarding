-- Turning what you just asked for into a reusable checklist.
--
-- Nobody sits down to author a template. They ask one new starter for eight
-- things, realise they will do it again next month, and want that set kept.
-- This captures the requests already raised for one person as a named checklist,
-- so the template is a by-product of doing the work rather than a separate task.

create or replace function public.save_requests_as_checklist(
  employee uuid, checklist_name text, checklist_kind plan_kind default 'Onboarding',
  checklist_description text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  org uuid := current_org_id();
  new_id uuid;
  item record;
  position int := 0;
  start_date date;
begin
  if not (is_admin() and has_permission('document.request')) then
    raise exception 'You do not have permission to manage document checklists.'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(trim(checklist_name), '') = '' then
    raise exception 'Give the checklist a name.' using errcode = 'check_violation';
  end if;

  insert into document_checklists (organisation_id, name, description, kind, created_by)
  values (org, trim(checklist_name), checklist_description, checklist_kind, auth.uid())
  returning id into new_id;

  -- Due dates are stored relative to when the pack was raised, so the same
  -- spacing applies to the next person whatever their start date is.
  select min(created_at)::date into start_date
    from document_requests where employee_id = employee and organisation_id = org;

  for item in
    select title, instructions, template_document_id, due_date, created_at
      from document_requests
     where employee_id = employee and organisation_id = org
     order by created_at, title
  loop
    insert into document_checklist_items (
      organisation_id, checklist_id, title, instructions, template_document_id,
      due_after_days, sort_order
    ) values (
      org, new_id, item.title, item.instructions, item.template_document_id,
      greatest(coalesce(item.due_date - start_date, 7), 0), position
    );
    position := position + 1;
  end loop;

  return new_id;
end $$;

grant execute on function public.save_requests_as_checklist(uuid, text, plan_kind, text) to authenticated;
