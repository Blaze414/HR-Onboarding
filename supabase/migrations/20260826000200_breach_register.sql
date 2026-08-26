-- Suspected data breaches, and the clock that starts when one is suspected.
--
-- The workspace can already answer *what happened* — who signed in from where,
-- who opened whose file, what was changed. The Notifiable Data Breaches scheme
-- asks something the audit trail cannot: what did you *do about it*, and how
-- quickly.
--
-- The shape of the obligation is a clock with two ends. When an entity suspects
-- an eligible data breach it must carry out a reasonable and expeditious
-- assessment, and thirty days is the outer limit rather than the target. If the
-- assessment finds reasonable grounds to believe the breach is eligible, the
-- OAIC and the affected individuals must be told as soon as practicable —
-- there is no second thirty days for that part.
--
-- So this register holds the dates, not the prose: suspected on, assessment due
-- by, assessed on, what was decided, notified on. A breach report that has to
-- reconstruct those from email is how thirty days becomes ninety.

create type breach_decision as enum (
  'Assessing',
  'Eligible — notification required',
  'Not eligible',
  'Remediated before serious harm'
);

create table data_breaches (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  -- When it was *suspected*, which is when the clock starts — not when it was
  -- confirmed, and not when somebody got round to opening this page.
  suspected_at    timestamptz not null default now(),
  assess_by       date not null,
  summary         text not null,
  -- What kinds of information were involved. Free text on purpose: the OAIC
  -- statement asks for a description, and a dropdown would flatten the thing
  -- the description exists to convey.
  information     text,
  raised_by       uuid references profiles(id) on delete set null,
  decision        breach_decision not null default 'Assessing',
  assessed_at     timestamptz,
  assessed_by     uuid references profiles(id) on delete set null,
  assessment_note text,
  -- s.26WK: telling the Commissioner. Separate from telling the people, because
  -- they are separate obligations that happen at different moments.
  oaic_notified_at        timestamptz,
  individuals_notified_at timestamptz,
  people_affected         integer,
  created_at      timestamptz not null default now()
);

create index data_breaches_open_idx on data_breaches (organisation_id, decision, assess_by);

alter table data_breaches enable row level security;
alter table data_breaches force row level security;

/*
 * The same readership as the monitoring page, and for the same reason: this is
 * the record a Super Administrator answers to the OAIC with. An ordinary admin
 * cannot read it — a breach may well be *about* an admin — and neither can the
 * person who reported it, once reported.
 */
create policy breach_read on data_breaches for select to authenticated
  using (organisation_id = current_org_id() and is_super_admin());

create policy breach_write on data_breaches for insert to authenticated
  with check (organisation_id = current_org_id() and is_super_admin());

create policy breach_update on data_breaches for update to authenticated
  using (organisation_id = current_org_id() and is_super_admin());

grant select, insert, update on public.data_breaches to authenticated;

-- No delete policy. A breach that turned out to be nothing is recorded as
-- nothing; it is not removed. "We looked and decided it was fine" is the most
-- important thing in the register when somebody later disagrees.

create or replace function public.guard_data_breach() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- Thirty days from suspicion. The Act says a reasonable and expeditious
    -- assessment; thirty days is the outer limit, which is why the view calls
    -- this the latest date rather than the due date.
    new.assess_by := (new.suspected_at + interval '30 days')::date;
    new.raised_by := coalesce(auth.uid(), new.raised_by);
    new.decision := 'Assessing';
    new.assessed_at := null;
    return new;
  end if;

  -- When it happened and when the assessment was owed are the facts the record
  -- exists to hold. Everything else may be updated as the assessment proceeds.
  new.suspected_at := old.suspected_at;
  new.assess_by := old.assess_by;
  new.raised_by := old.raised_by;

  if new.decision <> 'Assessing' and old.decision = 'Assessing' then
    if coalesce(trim(new.assessment_note), '') = '' then
      raise exception 'Record what the assessment found before closing it.'
        using errcode = 'check_violation';
    end if;
    new.assessed_at := coalesce(new.assessed_at, now());
    new.assessed_by := auth.uid();
  end if;

  -- Notifying only makes sense once the assessment says it is required.
  if (new.oaic_notified_at is not null or new.individuals_notified_at is not null)
     and new.decision <> 'Eligible — notification required' then
    raise exception 'Only an eligible breach is notified. Record the assessment first.'
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger data_breach_guard
  before insert or update on data_breaches
  for each row execute function public.guard_data_breach();

create view breach_register with (security_invoker = on) as
select
  b.*,
  r.name as raised_by_name,
  a.name as assessed_by_name,
  (b.decision = 'Assessing' and b.assess_by < current_date)      as assessment_overdue,
  (b.assess_by - current_date)                                    as days_to_assess,
  (b.decision = 'Eligible — notification required'
     and (b.oaic_notified_at is null or b.individuals_notified_at is null)) as notification_outstanding
from data_breaches b
left join profiles r on r.id = b.raised_by
left join profiles a on a.id = b.assessed_by;

grant select on public.breach_register to authenticated;
