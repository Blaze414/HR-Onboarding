-- Snoopy Workplace — core schema
-- Ownership model:
--   organisation_id  -> tenant ownership (which organisation owns the record)
--   owner_id / assigned_to / created_by / uploaded_by / actor_id / completed_by
--                    -> a user's *relationship* to the record. Never tenancy.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enums
create type user_role          as enum ('employee', 'admin');
create type course_status      as enum ('Pending', 'In Progress', 'Completed', 'Archived');
create type assignment_status  as enum ('Pending', 'In Progress', 'Completed');
create type task_status        as enum ('Pending', 'In Progress', 'Completed', 'Overdue');
create type task_priority      as enum ('Low', 'Medium', 'High');
create type onboarding_status  as enum ('Not Started', 'In Progress', 'Completed', 'Overdue');
create type step_status        as enum ('Pending', 'In Progress', 'Completed', 'Overdue');
create type step_type          as enum ('Task', 'Document', 'Course', 'Meeting', 'Form');
create type event_response     as enum ('Going', 'Maybe', 'Declined');

-- ---------------------------------------------------------------- tenant
create table organisations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  logo_url    text,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table departments (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  name            text not null,
  description     text,
  manager_id      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organisation_id, name)
);

create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  organisation_id uuid not null references organisations(id) on delete cascade,
  name            text not null,
  email           text not null,
  avatar_url      text,
  role            user_role not null default 'employee',
  job_title       text,
  department_id   uuid references departments(id) on delete set null,
  manager_id      uuid references profiles(id) on delete set null,
  start_date      date,
  phone           text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table departments
  add constraint departments_manager_fk
  foreign key (manager_id) references profiles(id) on delete set null;

-- ---------------------------------------------------------------- learning
create table courses (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  title           text not null,
  description     text,
  status          course_status not null default 'Pending',
  created_by      uuid references profiles(id) on delete set null,
  start_date      date,
  end_date        date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table course_assignments (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  course_id       uuid not null references courses(id) on delete cascade,
  user_id         uuid not null references profiles(id) on delete cascade,
  assigned_by     uuid references profiles(id) on delete set null,
  status          assignment_status not null default 'Pending',
  progress        int not null default 0 check (progress between 0 and 100),
  assigned_at     timestamptz not null default now(),
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  unique (course_id, user_id)
);

-- ---------------------------------------------------------------- work
create table tasks (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  title           text not null,
  description     text,
  created_by      uuid references profiles(id) on delete set null,
  assigned_to     uuid references profiles(id) on delete set null,
  course_id       uuid references courses(id) on delete set null,
  status          task_status not null default 'Pending',
  priority        task_priority not null default 'Medium',
  due_date        date,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create table events (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  title           text not null,
  description     text,
  start_time      timestamptz not null,
  end_time        timestamptz,
  location        text,
  created_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table event_participants (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  event_id        uuid not null references events(id) on delete cascade,
  user_id         uuid not null references profiles(id) on delete cascade,
  response        event_response,
  created_at      timestamptz not null default now(),
  unique (event_id, user_id)
);

create table documents (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  owner_id        uuid references profiles(id) on delete cascade, -- null = shared/organisation document
  uploaded_by     uuid references profiles(id) on delete set null,
  course_id       uuid references courses(id) on delete set null,
  name            text not null,
  storage_path    text not null,
  category        text not null default 'General',
  file_type       text,
  description     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------- onboarding
create table onboarding_templates (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  name            text not null,
  description     text,
  created_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table onboarding_template_steps (
  id                     uuid primary key default gen_random_uuid(),
  organisation_id        uuid not null references organisations(id) on delete cascade,
  onboarding_template_id uuid not null references onboarding_templates(id) on delete cascade,
  title                  text not null,
  description            text,
  type                   step_type not null default 'Task',
  sort_order             int not null default 0,
  required               boolean not null default true,
  created_at             timestamptz not null default now()
);

create table employee_onboarding (
  id                      uuid primary key default gen_random_uuid(),
  organisation_id         uuid not null references organisations(id) on delete cascade,
  employee_id             uuid not null references profiles(id) on delete cascade,
  template_id             uuid references onboarding_templates(id) on delete set null,
  status                  onboarding_status not null default 'Not Started',
  progress                int not null default 0 check (progress between 0 and 100),
  start_date              date,
  target_completion_date  date,
  completed_at            timestamptz,
  created_by              uuid references profiles(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create table onboarding_steps (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references organisations(id) on delete cascade,
  onboarding_id    uuid not null references employee_onboarding(id) on delete cascade,
  template_step_id uuid references onboarding_template_steps(id) on delete set null,
  title            text not null,
  description      text,
  type             step_type not null default 'Task',
  status           step_status not null default 'Pending',
  sort_order       int not null default 0,
  assigned_to      uuid references profiles(id) on delete set null,
  due_date         date,
  completed_at     timestamptz,
  completed_by     uuid references profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table activity_log (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  actor_id        uuid references profiles(id) on delete set null,
  action          text not null,
  entity_type     text not null,
  entity_id       uuid,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------- indexes
create index on profiles (organisation_id);
create index on profiles (department_id);
create index on departments (organisation_id);
create index on courses (organisation_id, status);
create index on course_assignments (organisation_id);
create index on course_assignments (user_id);
create index on course_assignments (course_id);
create index on tasks (organisation_id, status);
create index on tasks (assigned_to);
create index on events (organisation_id, start_time);
create index on event_participants (event_id);
create index on event_participants (user_id);
create index on documents (organisation_id, category);
create index on documents (owner_id);
create index on onboarding_templates (organisation_id);
create index on onboarding_template_steps (onboarding_template_id, sort_order);
create index on employee_onboarding (organisation_id, status);
create index on employee_onboarding (employee_id);
create index on onboarding_steps (onboarding_id, sort_order);
create index on onboarding_steps (assigned_to);
create index on activity_log (organisation_id, created_at desc);

-- ---------------------------------------------------------------- triggers
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'organisations','departments','profiles','courses','events','documents',
    'onboarding_templates','employee_onboarding','onboarding_steps'
  ] loop
    execute format(
      'create trigger %I_set_updated_at before update on %I
       for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- Keep employee_onboarding.progress/status derived from its steps.
create or replace function recalc_onboarding_progress() returns trigger
language plpgsql as $$
declare
  ob_id uuid := coalesce(new.onboarding_id, old.onboarding_id);
  total int;
  done  int;
  pct   int;
begin
  select count(*), count(*) filter (where status = 'Completed')
    into total, done
    from onboarding_steps where onboarding_id = ob_id;

  pct := case when total = 0 then 0 else round(done::numeric * 100 / total) end;

  update employee_onboarding
     set progress     = pct,
         status       = case
                          when total > 0 and done = total then 'Completed'::onboarding_status
                          when done > 0 then 'In Progress'::onboarding_status
                          else status
                        end,
         completed_at = case when total > 0 and done = total then coalesce(completed_at, now()) else null end
   where id = ob_id;

  return null;
end $$;

create trigger onboarding_steps_recalc
after insert or update or delete on onboarding_steps
for each row execute function recalc_onboarding_progress();
