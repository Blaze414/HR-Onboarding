-- Pay records and pay slips.
--
-- This is the largest gap the workspace had. Fair Work Regulations 3.33 to 3.36
-- require records of what somebody was paid, the hours behind it, the
-- superannuation contributed, and reg 3.46 requires a **pay slip within one
-- working day of the payment**, whether or not the person is on leave. None of
-- that existed here, and the seven-year retention this app enforces on
-- documents was quietly not covering the records that are most often asked for.
--
-- What this is *not* is a payroll calculator. Nothing in this schema works out
-- PAYG withholding or the superannuation guarantee — those are the job of a
-- payroll engine, and getting them wrong costs somebody real money. The
-- calculated figures arrive from outside, and what happens here is the part the
-- law puts on the employer regardless of who did the arithmetic: keeping the
-- record, issuing the slip, and being able to produce both years later.
--
-- `source` and `engine_reference` are the seam. A figure entered by hand and a
-- figure returned by an engine are both recorded, and which one it was stays on
-- the record — because "where did this number come from" is the first question
-- asked when one of them is wrong.

create type pay_period_status as enum ('Draft', 'Paid');
create type pay_source as enum ('Entered by hand', 'Payroll engine');

create table pay_periods (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  starts_on       date not null,
  ends_on         date not null,
  -- Null until it is paid. Everything downstream — the pay slip deadline, the
  -- superannuation deadline — counts from this date, so it is the moment the
  -- period stops being a plan.
  paid_on         date,
  status          pay_period_status not null default 'Draft',
  note            text,
  created_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  check (ends_on >= starts_on),
  unique (organisation_id, starts_on, ends_on)
);

create table pay_records (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  period_id       uuid not null references pay_periods(id) on delete cascade,
  employee_id     uuid not null references profiles(id) on delete cascade,

  -- reg 3.33: the rate, the gross, the net, and the deductions.
  gross_cents        bigint not null check (gross_cents >= 0),
  tax_withheld_cents bigint not null default 0 check (tax_withheld_cents >= 0),
  net_cents          bigint not null check (net_cents >= 0),
  -- Allowances, loadings, penalty rates and deductions, each with enough
  -- particulars that the employee can see how it was worked out — which is
  -- what reg 3.33 actually asks for, and why this is a list rather than a total.
  allowances      jsonb not null default '[]'::jsonb,
  deductions      jsonb not null default '[]'::jsonb,

  -- reg 3.34: hours, where the person is a casual or is paid overtime or
  -- penalty rates. Kept for everybody because knowing them costs nothing and
  -- not having them is the finding.
  ordinary_hours  numeric(7,2),
  overtime_hours  numeric(7,2),

  -- reg 3.35: superannuation.
  super_cents     bigint not null default 0 check (super_cents >= 0),
  super_fund      text,
  super_paid_on   date,

  -- reg 3.46: the pay slip.
  slip_issued_at  timestamptz,

  source          pay_source not null default 'Entered by hand',
  -- Whatever the engine calls this result, so a figure here can be traced back
  -- to the run that produced it.
  engine_reference text,
  created_at      timestamptz not null default now(),
  unique (period_id, employee_id)
);

create index pay_records_employee_idx on pay_records (employee_id, created_at desc);
create index pay_periods_org_idx on pay_periods (organisation_id, starts_on desc);

alter table pay_periods enable row level security;
alter table pay_periods force row level security;
alter table pay_records enable row level security;
alter table pay_records force row level security;

-- ------------------------------------------------------------------ who sees
--
-- Pay is the most sensitive thing in the workspace. An employee sees their own
-- and nothing else — not their team's, not their manager's — and a line manager
-- gets no special view, because what somebody earns is not line-management
-- information.
create policy pay_period_read on pay_periods for select to authenticated
  using (
    organisation_id = current_org_id()
    and (
      has_permission('payroll.manage')
      /*
       * Or you were paid in it. A pay slip is the period's dates plus your
       * line, so an employee who cannot read the period cannot read their own
       * slip either — which was the first thing the checks caught. They see
       * the periods they were paid in and no others.
       */
      or (
        has_permission('payroll.view_own')
        and exists (
          select 1 from pay_records r
           where r.period_id = pay_periods.id and r.employee_id = auth.uid()
        )
      )
    )
  );

create policy pay_period_write on pay_periods for insert to authenticated
  with check (organisation_id = current_org_id() and has_permission('payroll.manage'));

create policy pay_period_update on pay_periods for update to authenticated
  using (organisation_id = current_org_id() and has_permission('payroll.manage'));

create policy pay_record_read on pay_records for select to authenticated
  using (
    organisation_id = current_org_id()
    and (
      /*
       * Seeing your own pay is a permission like any other, not an assumption.
       * A role built for people who should not have pay in the app at all —
       * contractors given a login, a kiosk account — simply does not carry it,
       * and then the rows are invisible rather than merely unlinked.
       */
      (employee_id = auth.uid() and has_permission('payroll.view_own'))
      or has_permission('payroll.manage')
    )
  );

create policy pay_record_write on pay_records for insert to authenticated
  with check (organisation_id = current_org_id() and has_permission('payroll.manage'));

create policy pay_record_update on pay_records for update to authenticated
  using (organisation_id = current_org_id() and has_permission('payroll.manage'));

-- No delete policy on either. A pay record is a seven-year record from the day
-- it is made; there is no version of "we deleted the pay run" that ends well.

grant select, insert, update on public.pay_periods to authenticated;
grant select, insert, update on public.pay_records to authenticated;

-- --------------------------------------------------------------- the guards
create or replace function public.guard_pay_period() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.status := 'Draft';
    new.paid_on := null;
    return new;
  end if;

  new.organisation_id := old.organisation_id;
  new.created_by := old.created_by;

  -- A paid period is closed. Correcting one is done by paying an adjustment,
  -- which is how payroll has always handled it and why the record stands.
  if old.status = 'Paid' then
    if new.status <> 'Paid' or new.paid_on is distinct from old.paid_on
       or new.starts_on <> old.starts_on or new.ends_on <> old.ends_on then
      raise exception 'This period has been paid. Correct it with an adjustment in a later period.'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.status = 'Paid' and old.status = 'Draft' then
    new.paid_on := coalesce(new.paid_on, current_date);
    if not exists (select 1 from pay_records where period_id = new.id) then
      raise exception 'There is nothing in this period to pay.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

create trigger pay_period_guard
  before insert or update on pay_periods
  for each row execute function public.guard_pay_period();

create or replace function public.guard_pay_record() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  period record;
begin
  select * into period from pay_periods where id = coalesce(new.period_id, old.period_id);

  -- Figures may be corrected while the period is a draft, and not after.
  -- Everything except issuing the slip and recording the super payment, both of
  -- which necessarily happen after the money moves.
  if tg_op = 'UPDATE' and period.status = 'Paid' then
    new.gross_cents := old.gross_cents;
    new.net_cents := old.net_cents;
    new.tax_withheld_cents := old.tax_withheld_cents;
    new.super_cents := old.super_cents;
    new.allowances := old.allowances;
    new.deductions := old.deductions;
    new.ordinary_hours := old.ordinary_hours;
    new.overtime_hours := old.overtime_hours;
    new.employee_id := old.employee_id;
    new.period_id := old.period_id;
    new.source := old.source;
  end if;

  if tg_op = 'INSERT' and period.status = 'Paid' then
    raise exception 'This period has been paid and cannot take new lines.'
      using errcode = 'check_violation';
  end if;

  -- Net cannot exceed gross. Not an accounting rule so much as a typo detector:
  -- the two are entered separately and transposing them is the common mistake.
  if new.net_cents > new.gross_cents then
    raise exception 'Net pay cannot be more than gross pay.' using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger pay_record_guard
  before insert or update on pay_records
  for each row execute function public.guard_pay_record();

-- ------------------------------------------------------------ what is owing
create view pay_obligations with (security_invoker = on) as
select
  r.id, r.organisation_id, r.employee_id, r.period_id,
  p.name  as employee_name,
  p.email as employee_email,
  pp.starts_on, pp.ends_on, pp.paid_on, pp.status,
  r.gross_cents, r.tax_withheld_cents, r.net_cents,
  r.super_cents, r.super_fund, r.super_paid_on,
  r.ordinary_hours, r.overtime_hours,
  r.allowances, r.deductions,
  r.slip_issued_at, r.source, r.engine_reference,
  /*
   * reg 3.46: within one working day of the payment. Working days are
   * approximated as weekdays — public holidays differ by state and this app
   * does not hold a holiday calendar, so the deadline it reports is the
   * earliest one that could apply rather than the latest.
   */
  case when pp.paid_on is null then null
       else (pp.paid_on + case extract(isodow from pp.paid_on)
                            when 5 then 3    -- Friday  -> Monday
                            when 6 then 2    -- Saturday-> Monday
                            else 1 end)::date
  end as slip_due_by,
  (pp.status = 'Paid' and r.slip_issued_at is null
     and pp.paid_on + 1 < current_date)                 as slip_overdue,
  /*
   * Payday super: since 1 July 2026 contributions must reach the fund within
   * seven business days of payday. Approximated the same way and for the same
   * reason.
   */
  case when pp.paid_on is null then null
       else (pp.paid_on + interval '9 days')::date end  as super_due_by,
  (pp.status = 'Paid' and r.super_paid_on is null
     and pp.paid_on + 9 < current_date)                 as super_overdue
from pay_records r
join pay_periods pp on pp.id = r.period_id
join profiles p on p.id = r.employee_id;

grant select on public.pay_obligations to authenticated;
