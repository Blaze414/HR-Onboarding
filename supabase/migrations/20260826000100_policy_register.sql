-- The policies an employer is expected to have, and evidence people read them.
--
-- Several Australian obligations are not satisfied by intent or by conduct —
-- they expect a written policy that exists, is current, and has been
-- communicated. The positive duty under the Sex Discrimination Act is the
-- clearest: taking "reasonable and proportionate measures" is assessed on what
-- you can show, and a policy nobody has read is not a measure.
--
-- Nothing new is invented for this. The workspace already has documents, with
-- versions, and read receipts recorded against the version in force. What was
-- missing was the other direction: a list of what *ought* to exist, so that a
-- policy which was never written is visible as a gap rather than as an absence
-- of a row.
--
-- So a document can claim to satisfy an obligation, and the register reports
-- the four states that matter: nothing claims it, something claims it but does
-- not have to be read, it has to be read and some people have not, or it is in
-- place and current.

create type policy_requirement as enum (
  'Right to disconnect',
  'Preventing sexual harassment',
  'Work health and safety, including psychosocial hazards',
  'Discrimination, bullying and equal opportunity',
  'Privacy and personal information',
  'Whistleblower protections',
  'Workplace surveillance'
);

/*
 * Why each one is on the list, and under what.
 *
 * Reference data rather than workspace data: the obligations are the same for
 * every organisation in this database, and an obligation somebody can edit
 * away is not much of an obligation. What differs between workspaces is
 * whether it applies to them, which `universal` answers.
 */
create table policy_requirement_details (
  requirement policy_requirement primary key,
  authority   text not null,
  detail      text not null,
  -- False where the obligation depends on size, structure or jurisdiction, so
  -- the register can say "check whether this applies to you" rather than
  -- reporting a gap that may not be one.
  universal   boolean not null default true,
  sort_order  integer not null
);

insert into policy_requirement_details (requirement, authority, detail, universal, sort_order) values
  ('Right to disconnect',
   'Fair Work Act 2009 s.333M',
   'Employees may refuse unreasonable contact outside working hours. All employers are covered since 26 August 2025. Disputes go to the Fair Work Commission, which will ask what the employer told people.',
   true, 1),
  ('Preventing sexual harassment',
   'Sex Discrimination Act 1984 s.47C — the positive duty',
   'Employers must take reasonable and proportionate measures to eliminate sexual harassment and related conduct. Prevention, not response: the Australian Human Rights Commission has had enforcement powers since December 2023.',
   true, 2),
  ('Work health and safety, including psychosocial hazards',
   'Model WHS Regulations, and state psychosocial codes',
   'Psychological harm is a workplace hazard to be identified, assessed and controlled like any other. Victoria and Queensland have their own frameworks; the duty exists everywhere.',
   true, 3),
  ('Discrimination, bullying and equal opportunity',
   'Fair Work Act 2009 Part 3-1, and federal and state anti-discrimination law',
   'Adverse action and unlawful discrimination. Read together with the harassment and WHS policies rather than as a separate document.',
   true, 4),
  ('Privacy and personal information',
   'Privacy Act 1988, Australian Privacy Principle 1',
   'An organisation covered by the Act must have a clearly expressed and up-to-date privacy policy. The employee records exemption is narrower than it looks and is under review.',
   true, 5),
  ('Whistleblower protections',
   'Corporations Act 2001 s.1317AI',
   'Required of public companies, large proprietary companies and corporate trustees of registrable superannuation entities. Not every employer.',
   false, 6),
  ('Workplace surveillance',
   'State law — NSW, ACT and Victoria differ',
   'Where cameras, computer or tracking surveillance are used, notice requirements apply and vary by state. Only relevant if the workplace does any of it.',
   false, 7);

alter table policy_requirement_details enable row level security;
alter table policy_requirement_details force row level security;

-- Reference data: readable by everybody signed in, writable by nobody.
create policy policy_requirement_read on policy_requirement_details
  for select to authenticated using (true);

grant select on public.policy_requirement_details to authenticated;

-- ------------------------------------------------------------ the claim
alter table documents add column satisfies_policy policy_requirement;

comment on column documents.satisfies_policy is
  'The obligation this document is the workplace policy for. One document per obligation.';

-- One document per obligation per workspace. Two documents both claiming to be
-- the harassment policy is the state where nobody knows which one is in force.
create unique index documents_one_policy_per_requirement
  on documents (organisation_id, satisfies_policy)
  where satisfies_policy is not null;

-- A personal document is not a workplace policy; only a shared one can be.
alter table documents add constraint documents_policy_is_shared
  check (satisfies_policy is null or owner_id is null);

-- --------------------------------------------------------------- the register
create view policy_register with (security_invoker = on) as
with staff as (
  select organisation_id, count(*) as headcount
  from profiles where is_active
  group by organisation_id
),
claimed as (
  select
    d.organisation_id, d.satisfies_policy as requirement,
    d.id as document_id, d.name as document_name, d.version, d.created_at as published_at,
    d.requires_acknowledgement,
    (select count(*) from document_acknowledgements a
      where a.document_id = d.id and a.version = d.version) as acknowledged
  from documents d
  where d.satisfies_policy is not null
)
select
  o.id            as organisation_id,
  r.requirement,
  r.authority,
  r.detail,
  r.universal,
  r.sort_order,
  c.document_id,
  c.document_name,
  c.version,
  c.published_at,
  c.requires_acknowledgement,
  coalesce(c.acknowledged, 0)                                  as acknowledged,
  coalesce(s.headcount, 0)                                     as headcount,
  -- Null, not zero and not the headcount, where there is no policy to read.
  -- "Five people have not read it" is a lie about a document that was never
  -- written, and it is the sort of lie that makes a register ignorable.
  case
    when c.document_id is null or not c.requires_acknowledgement then null
    else greatest(coalesce(s.headcount, 0) - coalesce(c.acknowledged, 0), 0)
  end as outstanding,
  case
    when c.document_id is null                     then 'No policy'
    when not c.requires_acknowledgement            then 'Not required reading'
    when coalesce(c.acknowledged, 0) < coalesce(s.headcount, 0) then 'Not read by everybody'
    else 'In place'
  end as status
from organisations o
cross join policy_requirement_details r
left join claimed c
       on c.organisation_id = o.id and c.requirement = r.requirement
left join staff s on s.organisation_id = o.id
where o.id = current_org_id();

grant select on public.policy_register to authenticated;
