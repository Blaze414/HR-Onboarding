-- Saved views.
--
-- Every filter already lives in the URL, which makes a filtered report
-- shareable and reloadable but not *findable*: a manager who wants "my team,
-- overdue only" has to rebuild it from three dropdowns every morning, and a
-- view nobody can reach in one click is a view nobody uses twice.
--
-- A saved view is therefore nothing more than a name for a path and a query
-- string. Deliberately not a stored query: the report decides what the
-- parameters mean, so a view saved today keeps working when the report learns
-- a new filter, and can never widen what its owner is allowed to see.

create table saved_views (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  owner_id        uuid not null references profiles(id) on delete cascade,
  name            text not null,
  -- Path and query kept apart so the same name can exist on two reports.
  path            text not null,
  query           text not null default '',
  -- Shared views are the point: one coordinator works out the filter that
  -- answers a recurring question, and the rest of the team stops guessing.
  is_shared       boolean not null default false,
  created_at      timestamptz not null default now(),

  constraint saved_views_name_unique unique (owner_id, path, name),
  constraint saved_views_name_present check (length(btrim(name)) > 0),
  -- Relative paths only. An absolute URL here would turn a shared view into a
  -- link somebody else's browser follows off-site.
  constraint saved_views_path_relative check (path ~ '^/[A-Za-z0-9/_-]*$')
);

create index on saved_views (organisation_id, path);
create index on saved_views (owner_id);

alter table saved_views enable row level security;
alter table saved_views force row level security;

create policy saved_view_read on saved_views for select to authenticated
  using (
    organisation_id = current_org_id()
    and (owner_id = auth.uid() or is_shared)
  );

-- You save views for yourself. `owner_id` is pinned to the caller rather than
-- taken from the request, so nobody can plant a view in a colleague's list.
create policy saved_view_create on saved_views for insert to authenticated
  with check (organisation_id = current_org_id() and owner_id = auth.uid());

create policy saved_view_update on saved_views for update to authenticated
  using (organisation_id = current_org_id() and owner_id = auth.uid())
  with check (organisation_id = current_org_id() and owner_id = auth.uid());

create policy saved_view_delete on saved_views for delete to authenticated
  using (organisation_id = current_org_id() and owner_id = auth.uid());

grant select, insert, update, delete on public.saved_views to authenticated;
