-- Every change, recorded by the database.
--
-- There was already an activity log, and it was not an audit trail. Two
-- reasons, both fatal for the purpose:
--
--   * It was written by the *client*, by application code remembering to call
--     `logActivity` after doing something. Twelve actions were covered out of
--     everything the app can do, and anything reaching the database another way
--     — a script, `curl`, a feature whose author forgot — wrote nothing at all.
--   * Its insert policy allowed any signed-in user to add rows naming
--     themselves as the actor. A record somebody can compose is a record, not
--     evidence.
--
-- This one is written by triggers, so it does not depend on the app being
-- well behaved, and it has no insert, update or delete policy at all: the only
-- thing that can write to it is the trigger function, and nothing can amend it
-- afterwards. That is the whole point. A breach investigation that has to
-- trust the code being investigated is not an investigation.

create table audit_log (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid,
  -- Null when the change did not come from a signed-in person: a scheduled job,
  -- a migration, or the service key. Shown as "System" rather than hidden,
  -- because "nobody did this" is itself worth seeing.
  actor_id        uuid references profiles(id) on delete set null,
  action          text not null check (action in ('created', 'updated', 'deleted')),
  entity          text not null,
  entity_id       uuid,
  -- Whose record this is, where the row says. What a Super Administrator needs
  -- to answer "what was done to this person" without knowing the schema.
  subject_id      uuid references profiles(id) on delete set null,
  -- For an update, only the fields that actually changed, before and after.
  changes         jsonb not null default '{}'::jsonb,
  at              timestamptz not null default now()
);

create index audit_log_org_idx on audit_log (organisation_id, at desc);
create index audit_log_actor_idx on audit_log (actor_id, at desc);
create index audit_log_subject_idx on audit_log (subject_id, at desc);
create index audit_log_entity_idx on audit_log (entity, entity_id);

alter table audit_log enable row level security;
alter table audit_log force row level security;

/*
 * Two readerships, and no third.
 *
 * A Super Administrator sees their whole workspace, because that is the role
 * that has to answer to the OAIC and to the people affected when something
 * goes wrong. Everybody else sees what was done *to them* — which is not a
 * concession, it is the thing that keeps the first half honest: the people who
 * can watch everybody are themselves watched by everybody they touch.
 *
 * An ordinary admin sees neither. They are the population this exists to hold
 * to account.
 */
create policy audit_read on audit_log for select to authenticated
  using (
    organisation_id = current_org_id()
    and (is_super_admin() or subject_id = auth.uid())
  );

grant select on public.audit_log to authenticated;

-- ------------------------------------------------------------- the recorder
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  before_row jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  after_row  jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  row_json   jsonb := case when tg_op = 'DELETE' then before_row else after_row end;
  diff       jsonb := '{}'::jsonb;
  field      text;
  org        uuid;
  subject    uuid;
begin
  if tg_op = 'UPDATE' then
    for field in select jsonb_object_keys(after_row) loop
      if after_row -> field is distinct from before_row -> field then
        diff := diff || jsonb_build_object(
          field, jsonb_build_object('from', before_row -> field, 'to', after_row -> field));
      end if;
    end loop;
    -- An update that changed nothing is not an event. Saving it would bury the
    -- ones that are, and `updated_at` alone moves on plenty of writes.
    if diff = '{}'::jsonb or (select count(*) from jsonb_object_keys(diff)) = 0 then
      return coalesce(new, old);
    end if;
    if diff ?& array['updated_at'] and (select count(*) from jsonb_object_keys(diff)) = 1 then
      return coalesce(new, old);
    end if;
  end if;

  /*
   * The workspace is taken from the row where the row has one, and from the
   * actor otherwise. Some tables — a checklist step, a read receipt — belong
   * to a parent that carries it, and chasing that from a generic trigger would
   * mean the trigger knowing every schema in the app.
   */
  org := coalesce(nullif(row_json ->> 'organisation_id', '')::uuid, current_org_id());

  -- Whose record it is, under whichever name this table uses for that.
  subject := nullif(coalesce(
    row_json ->> 'employee_id',
    row_json ->> 'user_id',
    row_json ->> 'owner_id',
    case when tg_table_name = 'profiles' then row_json ->> 'id' end
  ), '')::uuid;

  insert into audit_log (organisation_id, actor_id, action, entity, entity_id, subject_id, changes)
  values (
    org,
    auth.uid(),
    case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end,
    tg_table_name,
    nullif(row_json ->> 'id', '')::uuid,
    subject,
    case when tg_op = 'UPDATE' then diff else '{}'::jsonb end
  );

  return coalesce(new, old);
exception when others then
  -- Never let the recording stop the work. A missing audit line is a problem
  -- to notice in the log; a failed approval because of one is a problem for
  -- somebody's afternoon.
  raise warning 'could not audit % on %: %', tg_op, tg_table_name, sqlerrm;
  return coalesce(new, old);
end $$;

/*
 * Attached to the tables that hold people, decisions about people, and the
 * things that decide who may do either. Deliberately not attached to the
 * queues and the noise — notifications, outboxes, push tokens — which record
 * that the app did its job, not that a person did something.
 *
 * Nor to the logs themselves: sign-in history and this table are append-only
 * already, and auditing an audit is how a table grows forever.
 */
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'departments', 'roles',
    'documents', 'document_requests', 'document_acknowledgements',
    'employee_credentials', 'credential_types',
    'courses', 'course_assignments',
    'tasks', 'events',
    'employee_onboarding', 'onboarding_steps', 'onboarding_templates',
    'statement_issues', 'emergency_contacts'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format(
        'create trigger %I after insert or update or delete on public.%I
           for each row execute function public.audit_row()',
        'audit_' || t, t);
    end if;
  end loop;
end $$;
