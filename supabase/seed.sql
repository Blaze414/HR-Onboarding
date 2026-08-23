-- Snoopy Workplace demo data.
-- Two organisations so that tenant isolation can actually be demonstrated.
-- Every demo account uses the password: snoopy123

-- ---------------------------------------------------------------- auth users
create or replace function seed_user(uid uuid, email text, full_name text)
returns void language plpgsql as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current
  ) values (
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
    email, crypt('snoopy123', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', full_name), now(), now(),
    '', '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), uid, uid::text,
    jsonb_build_object('sub', uid::text, 'email', email),
    'email', now(), now(), now()
  );
end $$;

select seed_user('11111111-1111-1111-1111-000000000001', 'lucy@peanutsstudio.test',    'Lucy van Pelt');
select seed_user('11111111-1111-1111-1111-000000000002', 'charlie@peanutsstudio.test', 'Charlie Brown');
select seed_user('11111111-1111-1111-1111-000000000003', 'schroeder@peanutsstudio.test','Schroeder');
select seed_user('11111111-1111-1111-1111-000000000004', 'marcie@peanutsstudio.test',  'Marcie');
select seed_user('11111111-1111-1111-1111-000000000005', 'patty@peanutsstudio.test',   'Peppermint Patty');
select seed_user('22222222-2222-2222-2222-000000000001', 'sally@woodstockdigital.test','Sally Brown');
select seed_user('22222222-2222-2222-2222-000000000002', 'linus@woodstockdigital.test','Linus van Pelt');
select seed_user('22222222-2222-2222-2222-000000000003', 'pigpen@woodstockdigital.test','Pig-Pen');

drop function seed_user(uuid, text, text);

-- ---------------------------------------------------------------- organisations
insert into organisations (id, name, slug) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Peanuts Creative Studio', 'peanuts-creative-studio'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Woodstock Digital',       'woodstock-digital');

-- ---------------------------------------------------------------- departments
insert into departments (id, organisation_id, name, description) values
  ('a0000000-0000-0000-0000-00000000d001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Technology',      'Product engineering and platform'),
  ('a0000000-0000-0000-0000-00000000d002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Learning',        'Course design and delivery'),
  ('a0000000-0000-0000-0000-00000000d003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Operations',      'Day to day studio operations'),
  ('a0000000-0000-0000-0000-00000000d004', 'aaaaaaaa-0000-0000-0000-000000000001', 'Administration',  'Finance and administration'),
  ('a0000000-0000-0000-0000-00000000d005', 'aaaaaaaa-0000-0000-0000-000000000001', 'People & Culture','People, hiring and onboarding'),
  ('b0000000-0000-0000-0000-00000000d001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Technology',      'Engineering team'),
  ('b0000000-0000-0000-0000-00000000d002', 'bbbbbbbb-0000-0000-0000-000000000001', 'Operations',      'Delivery and operations'),
  ('b0000000-0000-0000-0000-00000000d003', 'bbbbbbbb-0000-0000-0000-000000000001', 'Administration',  'Business administration');

-- ---------------------------------------------------------------- profiles
insert into profiles (id, organisation_id, name, email, role, job_title, department_id, start_date, phone) values
  ('11111111-1111-1111-1111-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Lucy van Pelt',    'lucy@peanutsstudio.test',     'admin',    'Head of Learning',         'a0000000-0000-0000-0000-00000000d002', '2024-02-05', '0400 000 001'),
  ('11111111-1111-1111-1111-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Charlie Brown',    'charlie@peanutsstudio.test',  'employee', 'Software Developer',     'a0000000-0000-0000-0000-00000000d001', '2026-06-15', '0400 000 002'),
  ('11111111-1111-1111-1111-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Schroeder',        'schroeder@peanutsstudio.test','employee', 'Software Developer',     'a0000000-0000-0000-0000-00000000d001', '2025-09-01', '0400 000 003'),
  ('11111111-1111-1111-1111-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'Marcie',           'marcie@peanutsstudio.test',   'employee', 'Operations Coordinator', 'a0000000-0000-0000-0000-00000000d003', '2025-03-10', '0400 000 004'),
  ('11111111-1111-1111-1111-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'Peppermint Patty', 'patty@peanutsstudio.test',    'employee', 'HR Coordinator',         'a0000000-0000-0000-0000-00000000d005', '2026-07-20', '0400 000 005'),
  ('22222222-2222-2222-2222-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Sally Brown',      'sally@woodstockdigital.test', 'admin',    'HR Coordinator',         'b0000000-0000-0000-0000-00000000d003', '2024-08-01', '0400 000 006'),
  ('22222222-2222-2222-2222-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', 'Linus van Pelt',   'linus@woodstockdigital.test', 'employee', 'Operations Coordinator', 'b0000000-0000-0000-0000-00000000d002', '2026-07-01', '0400 000 007'),
  ('22222222-2222-2222-2222-000000000003', 'bbbbbbbb-0000-0000-0000-000000000001', 'Pig-Pen',          'pigpen@woodstockdigital.test','employee', 'Software Developer',     'b0000000-0000-0000-0000-00000000d001', '2025-11-11', '0400 000 008');

update profiles set manager_id = '11111111-1111-1111-1111-000000000001'
  where organisation_id = 'aaaaaaaa-0000-0000-0000-000000000001' and role = 'employee';

-- Schroeder is an ordinary employee who manages Peppermint Patty. Reporting
-- lines grant visibility on their own, without any administrative permission.
update profiles set manager_id = '11111111-1111-1111-1111-000000000003'
  where id = '11111111-1111-1111-1111-000000000005';
update profiles set manager_id = '22222222-2222-2222-2222-000000000001'
  where organisation_id = 'bbbbbbbb-0000-0000-0000-000000000001' and role = 'employee';

update departments set manager_id = '11111111-1111-1111-1111-000000000001' where id = 'a0000000-0000-0000-0000-00000000d002';
update departments set manager_id = '11111111-1111-1111-1111-000000000003' where id = 'a0000000-0000-0000-0000-00000000d001';
update departments set manager_id = '11111111-1111-1111-1111-000000000004' where id = 'a0000000-0000-0000-0000-00000000d003';
update departments set manager_id = '22222222-2222-2222-2222-000000000001' where id = 'b0000000-0000-0000-0000-00000000d003';

update organisations set created_by = '11111111-1111-1111-1111-000000000001' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
update organisations set created_by = '22222222-2222-2222-2222-000000000001' where id = 'bbbbbbbb-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------- roles
select ensure_system_roles('aaaaaaaa-0000-0000-0000-000000000001');
select ensure_system_roles('bbbbbbbb-0000-0000-0000-000000000001');

-- A custom role, to show that permissions are data rather than code.
insert into roles (organisation_id, name, description, base_role, permissions) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Learning Coordinator',
   'Runs courses and onboarding without touching organisation settings.', 'admin',
   array[
     'course.view','course.update_progress','course.create','course.edit','course.assign','course.bulk_assign',
     'task.view','task.complete','task.create','task.edit','task.assign',
     'event.view','event.rsvp','event.create','event.edit','event.manage_participants',
     'document.view','document.upload_personal','document.manage_shared',
     'onboarding.view','onboarding.complete','onboarding.create','onboarding.template.manage',
     'employee.view_self','employee.view_all',
     'department.view','analytics.view_summary','analytics.view_full','report.view_summary','report.view_full'
   ]);

-- Everyone starts on the system role matching their tier. Matched by name
-- rather than by base_role, because two system roles now share the admin tier.
update profiles p
   set role_id = r.id
  from roles r
 where r.organisation_id = p.organisation_id
   and r.is_system
   and r.name = case when p.role = 'admin' then 'Administrator' else 'Employee' end;

-- Lucy runs the workspace and is the one account that can edit its own role.
update profiles p
   set role_id = r.id
  from roles r
 where p.id = '11111111-1111-1111-1111-000000000001'
   and r.organisation_id = p.organisation_id
   and r.name = 'Super Administrator';

-- Marcie shows the narrow admin-tier role: she runs courses and onboarding but
-- reaches no organisation settings, no role management and no employee records.
update profiles p
   set role_id = r.id
  from roles r
 where p.id = '11111111-1111-1111-1111-000000000004'
   and r.organisation_id = p.organisation_id
   and r.name = 'Learning Coordinator';

-- ---------------------------------------------------------------- document packs
-- Two named checklists, aimed at different teams, so the per-team automation is
-- demonstrable rather than theoretical.
insert into document_checklists (id, organisation_id, name, description, kind, created_by) values
  ('d0000000-0000-0000-0000-00000000e001','aaaaaaaa-0000-0000-0000-000000000001',
   'New Starter Pack','Everything a new joiner signs and returns in week one.','Onboarding',
   '11111111-1111-1111-1111-000000000001'),
  ('d0000000-0000-0000-0000-00000000e002','aaaaaaaa-0000-0000-0000-000000000001',
   'Technology Starter Pack','New Starter Pack plus the equipment and access forms.','Onboarding',
   '11111111-1111-1111-1111-000000000001'),
  ('d0000000-0000-0000-0000-00000000e003','aaaaaaaa-0000-0000-0000-000000000001',
   'Leaver Pack','Returned on the last two weeks.','Offboarding',
   '11111111-1111-1111-1111-000000000001');

insert into document_checklist_items (organisation_id, checklist_id, title, instructions, due_after_days, sort_order) values
  ('aaaaaaaa-0000-0000-0000-000000000001','d0000000-0000-0000-0000-00000000e001','Signed employment contract','Download it, sign it, and upload the signed copy.',3,1),
  ('aaaaaaaa-0000-0000-0000-000000000001','d0000000-0000-0000-0000-00000000e001','Photo identification','A passport or driver licence.',3,2),
  ('aaaaaaaa-0000-0000-0000-000000000001','d0000000-0000-0000-0000-00000000e001','Bank details form','So the first pay run reaches the right account.',5,3),
  ('aaaaaaaa-0000-0000-0000-000000000001','d0000000-0000-0000-0000-00000000e002','Signed employment contract','Download it, sign it, and upload the signed copy.',3,1),
  ('aaaaaaaa-0000-0000-0000-000000000001','d0000000-0000-0000-0000-00000000e002','Photo identification','A passport or driver licence.',3,2),
  ('aaaaaaaa-0000-0000-0000-000000000001','d0000000-0000-0000-0000-00000000e002','Equipment agreement','Covers the laptop and phone issued to you.',7,3),
  ('aaaaaaaa-0000-0000-0000-000000000001','d0000000-0000-0000-0000-00000000e003','Equipment return confirmation','Signed once the laptop and access card are handed back.',3,1);

-- Everyone gets the general pack; Technology gets its own as well.
insert into checklist_automations (organisation_id, checklist_id, department_id, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001','d0000000-0000-0000-0000-00000000e001', null,
   '11111111-1111-1111-1111-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000001','d0000000-0000-0000-0000-00000000e002',
   'a0000000-0000-0000-0000-00000000d001','11111111-1111-1111-1111-000000000001');

-- Peppermint Patty joined recently and still owes her paperwork.
insert into document_requests (organisation_id, employee_id, requested_by, title, instructions, due_date, status) values
  ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-000000000005',
   '11111111-1111-1111-1111-000000000001','Signed employment contract',
   'Download it, sign it, and upload the signed copy.', current_date - 2, 'Requested'),
  ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-000000000005',
   '11111111-1111-1111-1111-000000000001','Photo identification',
   'A passport or driver licence.', current_date + 5, 'Requested');

-- ------------------------------------------------------- credentials
-- The kinds this workspace recognises, and what each one opens up. Coverage is
-- the whole point: a certificate that qualifies nobody for anything is filing.
insert into credential_types (id, organisation_id, name, description, requires_expiry, renewal_notice_days, is_sensitive, verification_guidance) values
  ('e0000000-0000-0000-0000-00000000c001','aaaaaaaa-0000-0000-0000-000000000001',
   'First Aid Certificate','Current first aid, renewed every three years.', true, 60, false,
   'Sight the original certificate and check the issue date.'),
  ('e0000000-0000-0000-0000-00000000c002','aaaaaaaa-0000-0000-0000-000000000001',
   'Background Check','Required before working unsupervised with the public.', true, 90, true,
   'Check the number against the issuing register, and sight the original card.'),
  ('e0000000-0000-0000-0000-00000000c003','aaaaaaaa-0000-0000-0000-000000000001',
   'Professional Qualification','A degree or diploma relevant to the role.', false, 60, false,
   'Sight the certificate or an official transcript.'),
  ('e0000000-0000-0000-0000-00000000c004','aaaaaaaa-0000-0000-0000-000000000001',
   'Second Language','Conversational or better, useful on the front desk.', false, 60, false,
   'A short conversation with someone who speaks it is enough.');

-- `is_required` separates "cannot work there without it" from "this opens the
-- department up": the Background Check is the former, a second
-- language the latter, and rostering treats them very differently.
insert into credential_department_coverage (credential_type_id, department_id, organisation_id, is_required) values
  ('e0000000-0000-0000-0000-00000000c001','a0000000-0000-0000-0000-00000000d002','aaaaaaaa-0000-0000-0000-000000000001', false),
  ('e0000000-0000-0000-0000-00000000c001','a0000000-0000-0000-0000-00000000d003','aaaaaaaa-0000-0000-0000-000000000001', false),
  ('e0000000-0000-0000-0000-00000000c002','a0000000-0000-0000-0000-00000000d002','aaaaaaaa-0000-0000-0000-000000000001', true),
  ('e0000000-0000-0000-0000-00000000c003','a0000000-0000-0000-0000-00000000d002','aaaaaaaa-0000-0000-0000-000000000001', false),
  ('e0000000-0000-0000-0000-00000000c004','a0000000-0000-0000-0000-00000000d003','aaaaaaaa-0000-0000-0000-000000000001', false);

-- Charlie is a developer who could cover Learning and Operations; his first aid
-- certificate is about to lapse, which is exactly the case HR needs warning of.
insert into employee_credentials
  (organisation_id, employee_id, credential_type_id, title, issuer, issued_on, expires_on, status,
   verified_by, verified_at, reference_number, jurisdiction, verification_method, original_sighted) values
  ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-000000000002',
   'e0000000-0000-0000-0000-00000000c001','First Aid Certificate','St John', current_date - 1060,
   current_date + 21, 'Verified','11111111-1111-1111-1111-000000000001', now() - interval '30 days',
   'SJ-448120','New South Wales','Original sighted', true),
  ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-000000000002',
   'e0000000-0000-0000-0000-00000000c004','Japanese — conversational', null, current_date - 400,
   null, 'Verified','11111111-1111-1111-1111-000000000001', now() - interval '20 days',
   null, null, 'Conversation with the team lead', false),
  -- Schroeder has offered a check nobody has looked at yet: a claim, not cover.
  ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-000000000003',
   'e0000000-0000-0000-0000-00000000c002','Background Check','State registry', current_date - 200,
   current_date + 900, 'Pending', null, null,
   'WWC1882431E','New South Wales', null, false);

-- ---------------------------------------------------------------- courses
insert into courses (id, organisation_id, title, description, status, created_by, start_date, end_date) values
  ('c0000000-0000-0000-0000-00000000c001', 'aaaaaaaa-0000-0000-0000-000000000001', 'React Native Fundamentals',  'Build your first mobile screens, navigation and state.', 'In Progress', '11111111-1111-1111-1111-000000000001', current_date - 30, current_date + 30),
  ('c0000000-0000-0000-0000-00000000c002', 'aaaaaaaa-0000-0000-0000-000000000001', 'JavaScript Essentials',      'Language foundations, async patterns and tooling.',      'Completed',   '11111111-1111-1111-1111-000000000001', current_date - 90, current_date - 20),
  ('c0000000-0000-0000-0000-00000000c003', 'aaaaaaaa-0000-0000-0000-000000000001', 'UI Design Basics',           'Layout, hierarchy, colour and accessible interfaces.',   'In Progress', '11111111-1111-1111-1111-000000000001', current_date - 20, current_date + 40),
  ('c0000000-0000-0000-0000-00000000c004', 'aaaaaaaa-0000-0000-0000-000000000001', 'Database Fundamentals',      'Relational modelling, indexes and query planning.',      'Pending',     '11111111-1111-1111-1111-000000000001', current_date + 7,  current_date + 60),
  ('c0000000-0000-0000-0000-00000000c005', 'aaaaaaaa-0000-0000-0000-000000000001', 'Communication Skills',       'Written and verbal communication at work.',              'In Progress', '11111111-1111-1111-1111-000000000001', current_date - 15, current_date + 15),
  ('c0000000-0000-0000-0000-00000000c006', 'aaaaaaaa-0000-0000-0000-000000000001', 'Leadership Foundations',     'Coaching, feedback and running a small team.',           'In Progress', '11111111-1111-1111-1111-000000000001', current_date - 10, current_date + 50),
  ('c0000000-0000-0000-0000-00000000c007', 'aaaaaaaa-0000-0000-0000-000000000001', 'Workplace Safety',           'Everyday safety practices in the studio.',               'Completed',   '11111111-1111-1111-1111-000000000001', current_date - 120,current_date - 60),
  ('c0000000-0000-0000-0000-00000000c008', 'aaaaaaaa-0000-0000-0000-000000000001', 'Project Management Basics',  'Scoping, estimating and tracking delivery.',             'Pending',     '11111111-1111-1111-1111-000000000001', current_date + 14, current_date + 70),
  ('d0000000-0000-0000-0000-00000000c001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Workplace Safety',           'Everyday safety practices at Woodstock Digital.',        'In Progress', '22222222-2222-2222-2222-000000000001', current_date - 25, current_date + 25),
  ('d0000000-0000-0000-0000-00000000c002', 'bbbbbbbb-0000-0000-0000-000000000001', 'Project Management Basics',  'Delivery fundamentals for coordinators.',                'In Progress', '22222222-2222-2222-2222-000000000001', current_date - 12, current_date + 45),
  ('d0000000-0000-0000-0000-00000000c003', 'bbbbbbbb-0000-0000-0000-000000000001', 'JavaScript Essentials',      'Language foundations for the engineering team.',         'Pending',     '22222222-2222-2222-2222-000000000001', current_date + 5,  current_date + 55);

-- ---------------------------------------------------------------- course assignments
insert into course_assignments (organisation_id, course_id, user_id, assigned_by, status, progress, completed_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001','c0000000-0000-0000-0000-00000000c001','11111111-1111-1111-1111-000000000002','11111111-1111-1111-1111-000000000001','In Progress', 65, null),
  ('aaaaaaaa-0000-0000-0000-000000000001','c0000000-0000-0000-0000-00000000c002','11111111-1111-1111-1111-000000000002','11111111-1111-1111-1111-000000000001','Completed',  100, now() - interval '18 days'),
  ('aaaaaaaa-0000-0000-0000-000000000001','c0000000-0000-0000-0000-00000000c003','11111111-1111-1111-1111-000000000002','11111111-1111-1111-1111-000000000001','In Progress', 40, null),
  ('aaaaaaaa-0000-0000-0000-000000000001','c0000000-0000-0000-0000-00000000c007','11111111-1111-1111-1111-000000000002','11111111-1111-1111-1111-000000000001','Completed',  100, now() - interval '62 days'),
  ('aaaaaaaa-0000-0000-0000-000000000001','c0000000-0000-0000-0000-00000000c004','11111111-1111-1111-1111-000000000002','11111111-1111-1111-1111-000000000001','Pending',      0, null),
  ('aaaaaaaa-0000-0000-0000-000000000001','c0000000-0000-0000-0000-00000000c001','11111111-1111-1111-1111-000000000003','11111111-1111-1111-1111-000000000001','In Progress', 85, null),
  ('aaaaaaaa-0000-0000-0000-000000000001','c0000000-0000-0000-0000-00000000c002','11111111-1111-1111-1111-000000000003','11111111-1111-1111-1111-000000000001','Completed',  100, now() - interval '25 days'),
  ('aaaaaaaa-0000-0000-0000-000000000001','c0000000-0000-0000-0000-00000000c008','11111111-1111-1111-1111-000000000003','11111111-1111-1111-1111-000000000001','Pending',      0, null),
  ('aaaaaaaa-0000-0000-0000-000000000001','c0000000-0000-0000-0000-00000000c005','11111111-1111-1111-1111-000000000004','11111111-1111-1111-1111-000000000001','In Progress', 55, null),
  ('aaaaaaaa-0000-0000-0000-000000000001','c0000000-0000-0000-0000-00000000c007','11111111-1111-1111-1111-000000000004','11111111-1111-1111-1111-000000000001','Completed',  100, now() - interval '70 days'),
  ('aaaaaaaa-0000-0000-0000-000000000001','c0000000-0000-0000-0000-00000000c003','11111111-1111-1111-1111-000000000005','11111111-1111-1111-1111-000000000001','In Progress', 20, null),
  ('aaaaaaaa-0000-0000-0000-000000000001','c0000000-0000-0000-0000-00000000c005','11111111-1111-1111-1111-000000000005','11111111-1111-1111-1111-000000000001','Pending',      0, null),
  ('aaaaaaaa-0000-0000-0000-000000000001','c0000000-0000-0000-0000-00000000c006','11111111-1111-1111-1111-000000000001','11111111-1111-1111-1111-000000000001','In Progress', 90, null),
  ('aaaaaaaa-0000-0000-0000-000000000001','c0000000-0000-0000-0000-00000000c002','11111111-1111-1111-1111-000000000001','11111111-1111-1111-1111-000000000001','Completed',  100, now() - interval '40 days'),
  ('bbbbbbbb-0000-0000-0000-000000000001','d0000000-0000-0000-0000-00000000c001','22222222-2222-2222-2222-000000000002','22222222-2222-2222-2222-000000000001','In Progress', 30, null),
  ('bbbbbbbb-0000-0000-0000-000000000001','d0000000-0000-0000-0000-00000000c002','22222222-2222-2222-2222-000000000002','22222222-2222-2222-2222-000000000001','Pending',      0, null),
  ('bbbbbbbb-0000-0000-0000-000000000001','d0000000-0000-0000-0000-00000000c001','22222222-2222-2222-2222-000000000003','22222222-2222-2222-2222-000000000001','Completed',  100, now() - interval '5 days'),
  ('bbbbbbbb-0000-0000-0000-000000000001','d0000000-0000-0000-0000-00000000c003','22222222-2222-2222-2222-000000000003','22222222-2222-2222-2222-000000000001','In Progress', 45, null);


-- Some courses are required rather than optional. Charlie has one overdue and
-- one due soon, so both states are visible without editing data by hand.
update course_assignments set is_required = true, due_date = current_date - 3
 where user_id = '11111111-1111-1111-1111-000000000002'
   and course_id = 'c0000000-0000-0000-0000-00000000c004';

update course_assignments set is_required = true, due_date = current_date + 5
 where user_id = '11111111-1111-1111-1111-000000000002'
   and course_id = 'c0000000-0000-0000-0000-00000000c003';

update course_assignments set is_required = true, due_date = current_date + 21
 where user_id = '11111111-1111-1111-1111-000000000003'
   and course_id = 'c0000000-0000-0000-0000-00000000c008';

-- ---------------------------------------------------------------- tasks
insert into tasks (organisation_id, title, description, created_by, assigned_to, course_id, status, priority, due_date, completed_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001','Review lesson material','Read through module three before the workshop.','11111111-1111-1111-1111-000000000001','11111111-1111-1111-1111-000000000002','c0000000-0000-0000-0000-00000000c001','In Progress','High',   current_date + 2, null),
  ('aaaaaaaa-0000-0000-0000-000000000001','Upload course notes','Share your notes with the rest of the cohort.','11111111-1111-1111-1111-000000000001','11111111-1111-1111-1111-000000000002','c0000000-0000-0000-0000-00000000c001','Pending','Medium', current_date - 3, null),
  ('aaaaaaaa-0000-0000-0000-000000000001','Complete profile','Add your phone number and start date.','11111111-1111-1111-1111-000000000001','11111111-1111-1111-1111-000000000002',null,'Completed','Low',    current_date - 20, now() - interval '19 days'),
  ('aaaaaaaa-0000-0000-0000-000000000001','Schedule manager meeting','Book a 30 minute catch-up with Lucy.','11111111-1111-1111-1111-000000000001','11111111-1111-1111-1111-000000000002',null,'Completed','Medium', current_date - 10, now() - interval '9 days'),
  ('aaaaaaaa-0000-0000-0000-000000000001','Review project documentation','Check the handbook is still accurate.','11111111-1111-1111-1111-000000000001','11111111-1111-1111-1111-000000000003',null,'In Progress','Medium', current_date + 5, null),
  ('aaaaaaaa-0000-0000-0000-000000000001','Prepare workshop','Set up the room and share the agenda.','11111111-1111-1111-1111-000000000001','11111111-1111-1111-1111-000000000003',null,'Completed','High',   current_date - 6, now() - interval '6 days'),
  ('aaaaaaaa-0000-0000-0000-000000000001','Update team roster','Refresh the on-call roster for next month.','11111111-1111-1111-1111-000000000001','11111111-1111-1111-1111-000000000004',null,'Pending','Low',    current_date + 9, null),
  ('aaaaaaaa-0000-0000-0000-000000000001','Order studio supplies','Restock the shared kitchen and stationery.','11111111-1111-1111-1111-000000000001','11111111-1111-1111-1111-000000000004',null,'Completed','Low',    current_date - 14, now() - interval '13 days'),
  ('aaaaaaaa-0000-0000-0000-000000000001','Draft welcome pack','Prepare the welcome pack for new starters.','11111111-1111-1111-1111-000000000001','11111111-1111-1111-1111-000000000005',null,'In Progress','High',   current_date + 1, null),
  ('aaaaaaaa-0000-0000-0000-000000000001','Confirm orientation dates','Lock in the next orientation session.','11111111-1111-1111-1111-000000000001','11111111-1111-1111-1111-000000000005',null,'Pending','Medium', current_date - 1, null),
  ('aaaaaaaa-0000-0000-0000-000000000001','Plan next course intake','Draft the schedule for the new cohort.','11111111-1111-1111-1111-000000000001','11111111-1111-1111-1111-000000000001',null,'In Progress','Medium', current_date + 12, null),
  ('bbbbbbbb-0000-0000-0000-000000000001','Review lesson material','Work through the safety module.','22222222-2222-2222-2222-000000000001','22222222-2222-2222-2222-000000000002','d0000000-0000-0000-0000-00000000c001','Pending','High',   current_date - 4, null),
  ('bbbbbbbb-0000-0000-0000-000000000001','Complete profile','Finish setting up your profile details.','22222222-2222-2222-2222-000000000001','22222222-2222-2222-2222-000000000002',null,'Completed','Low',    current_date - 30, now() - interval '28 days'),
  ('bbbbbbbb-0000-0000-0000-000000000001','Prepare workshop','Organise the delivery workshop.','22222222-2222-2222-2222-000000000001','22222222-2222-2222-2222-000000000003',null,'Completed','Medium', current_date - 8, now() - interval '8 days'),
  ('bbbbbbbb-0000-0000-0000-000000000001','Review project documentation','Update the delivery playbook.','22222222-2222-2222-2222-000000000001','22222222-2222-2222-2222-000000000003',null,'In Progress','Medium', current_date + 6, null);

update tasks set status = 'Overdue'
 where status in ('Pending','In Progress') and due_date < current_date;

-- ---------------------------------------------------------------- events
insert into events (id, organisation_id, title, description, start_time, end_time, location, created_by) values
  ('e0000000-0000-0000-0000-00000000e001','aaaaaaaa-0000-0000-0000-000000000001','Team Workshop',   'Hands-on session for the mobile project.', now() + interval '2 days',  now() + interval '2 days 2 hours',  'Studio — Room 1', '11111111-1111-1111-1111-000000000001'),
  ('e0000000-0000-0000-0000-00000000e002','aaaaaaaa-0000-0000-0000-000000000001','Planning Session','Plan the next delivery cycle.',            now() + interval '5 days',  now() + interval '5 days 90 minutes','Studio — Room 2', '11111111-1111-1111-1111-000000000001'),
  ('e0000000-0000-0000-0000-00000000e003','aaaaaaaa-0000-0000-0000-000000000001','Monthly Meeting', 'Studio-wide monthly update.',              now() + interval '12 days', now() + interval '12 days 1 hour',  'Main Space',      '11111111-1111-1111-1111-000000000001'),
  ('e0000000-0000-0000-0000-00000000e004','aaaaaaaa-0000-0000-0000-000000000001','Project Review',  'Review of the last delivery cycle.',       now() - interval '6 days',  now() - interval '6 days' + interval '1 hour','Studio — Room 1','11111111-1111-1111-1111-000000000001'),
  ('f0000000-0000-0000-0000-00000000e001','bbbbbbbb-0000-0000-0000-000000000001','Training Session','Safety refresher for the whole team.',     now() + interval '3 days',  now() + interval '3 days 2 hours',  'Level 4 Boardroom','22222222-2222-2222-2222-000000000001'),
  ('f0000000-0000-0000-0000-00000000e002','bbbbbbbb-0000-0000-0000-000000000001','Monthly Meeting', 'Company update and Q&A.',                  now() + interval '9 days',  now() + interval '9 days 1 hour',   'Level 4 Boardroom','22222222-2222-2222-2222-000000000001');

insert into event_participants (organisation_id, event_id, user_id, response) values
  ('aaaaaaaa-0000-0000-0000-000000000001','e0000000-0000-0000-0000-00000000e001','11111111-1111-1111-1111-000000000002','Going'),
  ('aaaaaaaa-0000-0000-0000-000000000001','e0000000-0000-0000-0000-00000000e001','11111111-1111-1111-1111-000000000003','Going'),
  ('aaaaaaaa-0000-0000-0000-000000000001','e0000000-0000-0000-0000-00000000e002','11111111-1111-1111-1111-000000000002','Maybe'),
  ('aaaaaaaa-0000-0000-0000-000000000001','e0000000-0000-0000-0000-00000000e003','11111111-1111-1111-1111-000000000004','Going'),
  ('bbbbbbbb-0000-0000-0000-000000000001','f0000000-0000-0000-0000-00000000e001','22222222-2222-2222-2222-000000000002','Going');

-- ---------------------------------------------------------------- documents
-- Metadata only. Uploading through the app writes the object into Storage.
insert into documents (organisation_id, owner_id, uploaded_by, course_id, name, storage_path, category, file_type, description) values
  ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-000000000002','11111111-1111-1111-1111-000000000002',null,'Employment Agreement','aaaaaaaa-0000-0000-0000-000000000001/11111111-1111-1111-1111-000000000002/employment-agreement.pdf','HR Documents','application/pdf','Signed agreement'),
  ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-000000000002','11111111-1111-1111-1111-000000000002','c0000000-0000-0000-0000-00000000c001','React Native Notes','aaaaaaaa-0000-0000-0000-000000000001/11111111-1111-1111-1111-000000000002/react-native-notes.pdf','Course Material','application/pdf','Personal course notes'),
  ('aaaaaaaa-0000-0000-0000-000000000001',null,'11111111-1111-1111-1111-000000000001',null,'Team Handbook','aaaaaaaa-0000-0000-0000-000000000001/shared/team-handbook.pdf','Shared','application/pdf','How we work'),
  ('aaaaaaaa-0000-0000-0000-000000000001',null,'11111111-1111-1111-1111-000000000001',null,'Studio Policies','aaaaaaaa-0000-0000-0000-000000000001/shared/studio-policies.pdf','Shared','application/pdf','Workplace policies'),
  ('bbbbbbbb-0000-0000-0000-000000000001','22222222-2222-2222-2222-000000000002','22222222-2222-2222-2222-000000000002',null,'Employment Agreement','bbbbbbbb-0000-0000-0000-000000000001/22222222-2222-2222-2222-000000000002/employment-agreement.pdf','HR Documents','application/pdf','Signed agreement'),
  ('bbbbbbbb-0000-0000-0000-000000000001',null,'22222222-2222-2222-2222-000000000001',null,'Team Handbook','bbbbbbbb-0000-0000-0000-000000000001/shared/team-handbook.pdf','Shared','application/pdf','How we work');

-- ---------------------------------------------------------------- onboarding templates
insert into onboarding_templates (id, organisation_id, name, description, created_by) values
  ('a1000000-0000-0000-0000-00000000a001','aaaaaaaa-0000-0000-0000-000000000001','Software Developer Onboarding','First weeks for a new developer.', '11111111-1111-1111-1111-000000000001'),
  ('a1000000-0000-0000-0000-00000000a002','aaaaaaaa-0000-0000-0000-000000000001','Learning Team Onboarding','First weeks for a new starter in Learning.',            '11111111-1111-1111-1111-000000000001'),
  ('a1000000-0000-0000-0000-00000000a003','aaaaaaaa-0000-0000-0000-000000000001','Operations Coordinator Onboarding','First weeks in operations.','11111111-1111-1111-1111-000000000001'),
  ('b1000000-0000-0000-0000-00000000a001','bbbbbbbb-0000-0000-0000-000000000001','Operations Coordinator Onboarding','First weeks in operations.','22222222-2222-2222-2222-000000000001');

-- Leaving is as structured as joining, and was the one lifecycle event with no
-- plan behind it.
insert into onboarding_templates (id, organisation_id, name, description, kind, created_by) values
  ('a1000000-0000-0000-0000-00000000f001','aaaaaaaa-0000-0000-0000-000000000001',
   'Standard Offboarding','Last two weeks: handover, equipment, accounts and the exit conversation.',
   'Offboarding','11111111-1111-1111-1111-000000000001');

insert into onboarding_template_steps (organisation_id, onboarding_template_id, title, type, sort_order, required) values
  ('aaaaaaaa-0000-0000-0000-000000000001','a1000000-0000-0000-0000-00000000f001','Hand over open tasks to a colleague','Task',1,true),
  ('aaaaaaaa-0000-0000-0000-000000000001','a1000000-0000-0000-0000-00000000f001','Write handover notes for the team','Document',2,true),
  ('aaaaaaaa-0000-0000-0000-000000000001','a1000000-0000-0000-0000-00000000f001','Return laptop and access card','Task',3,true),
  ('aaaaaaaa-0000-0000-0000-000000000001','a1000000-0000-0000-0000-00000000f001','Close workspace and email accounts','Task',4,true),
  ('aaaaaaaa-0000-0000-0000-000000000001','a1000000-0000-0000-0000-00000000f001','Hold the exit conversation','Meeting',5,true),
  ('aaaaaaaa-0000-0000-0000-000000000001','a1000000-0000-0000-0000-00000000f001','Confirm final pay and leave balance','Form',6,true);

insert into onboarding_template_steps (organisation_id, onboarding_template_id, title, type, sort_order, required) values
  ('aaaaaaaa-0000-0000-0000-000000000001','a1000000-0000-0000-0000-00000000a001','Complete Profile',    'Form',     1, true),
  ('aaaaaaaa-0000-0000-0000-000000000001','a1000000-0000-0000-0000-00000000a001','Submit Documents',    'Document', 2, true),
  ('aaaaaaaa-0000-0000-0000-000000000001','a1000000-0000-0000-0000-00000000a001','Security Training',   'Course',   3, true),
  ('aaaaaaaa-0000-0000-0000-000000000001','a1000000-0000-0000-0000-00000000a001','Company Orientation', 'Meeting',  4, true),
  ('aaaaaaaa-0000-0000-0000-000000000001','a1000000-0000-0000-0000-00000000a001','Meet Manager',        'Meeting',  5, true),
  ('aaaaaaaa-0000-0000-0000-000000000001','a1000000-0000-0000-0000-00000000a001','First Week Review',   'Task',     6, false),
  ('aaaaaaaa-0000-0000-0000-000000000001','a1000000-0000-0000-0000-00000000a002','Complete Profile',        'Form',     1, true),
  ('aaaaaaaa-0000-0000-0000-000000000001','a1000000-0000-0000-0000-00000000a002','Submit Documents',        'Document', 2, true),
  ('aaaaaaaa-0000-0000-0000-000000000001','a1000000-0000-0000-0000-00000000a002','Workplace Orientation',   'Meeting',  3, true),
  ('aaaaaaaa-0000-0000-0000-000000000001','a1000000-0000-0000-0000-00000000a002','Complete Assigned Courses','Course',   4, true),
  ('aaaaaaaa-0000-0000-0000-000000000001','a1000000-0000-0000-0000-00000000a002','Meet Team Lead',          'Meeting',  5, true),
  ('aaaaaaaa-0000-0000-0000-000000000001','a1000000-0000-0000-0000-00000000a002','Team Introduction',       'Task',     6, false),
  ('aaaaaaaa-0000-0000-0000-000000000001','a1000000-0000-0000-0000-00000000a003','Complete Profile',   'Form',     1, true),
  ('aaaaaaaa-0000-0000-0000-000000000001','a1000000-0000-0000-0000-00000000a003','Submit Documents',   'Document', 2, true),
  ('aaaaaaaa-0000-0000-0000-000000000001','a1000000-0000-0000-0000-00000000a003','Systems Walkthrough','Meeting',  3, true),
  ('aaaaaaaa-0000-0000-0000-000000000001','a1000000-0000-0000-0000-00000000a003','First Week Review',  'Task',     4, false),
  ('bbbbbbbb-0000-0000-0000-000000000001','b1000000-0000-0000-0000-00000000a001','Complete Profile',   'Form',     1, true),
  ('bbbbbbbb-0000-0000-0000-000000000001','b1000000-0000-0000-0000-00000000a001','Submit Documents',   'Document', 2, true),
  ('bbbbbbbb-0000-0000-0000-000000000001','b1000000-0000-0000-0000-00000000a001','Systems Walkthrough','Meeting',  3, true),
  ('bbbbbbbb-0000-0000-0000-000000000001','b1000000-0000-0000-0000-00000000a001','First Week Review',  'Task',     4, false);

-- ---------------------------------------------------------------- employee onboarding
insert into employee_onboarding (id, organisation_id, employee_id, template_id, status, start_date, target_completion_date, created_by) values
  ('a2000000-0000-0000-0000-00000000b001','aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-000000000002','a1000000-0000-0000-0000-00000000a001','In Progress', current_date - 20, current_date + 10, '11111111-1111-1111-1111-000000000001'),
  ('a2000000-0000-0000-0000-00000000b002','aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-000000000005','a1000000-0000-0000-0000-00000000a003','In Progress', current_date - 12, current_date + 18, '11111111-1111-1111-1111-000000000001'),
  ('a2000000-0000-0000-0000-00000000b003','aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-000000000003','a1000000-0000-0000-0000-00000000a001','In Progress', current_date - 200,current_date - 170,'11111111-1111-1111-1111-000000000001'),
  ('b2000000-0000-0000-0000-00000000b001','bbbbbbbb-0000-0000-0000-000000000001','22222222-2222-2222-2222-000000000002','b1000000-0000-0000-0000-00000000a001','In Progress', current_date - 45, current_date - 15, '22222222-2222-2222-2222-000000000001');

-- Charlie: 4 of 6 done
insert into onboarding_steps (organisation_id, onboarding_id, title, type, status, sort_order, assigned_to, due_date, completed_at, completed_by)
select 'aaaaaaaa-0000-0000-0000-000000000001','a2000000-0000-0000-0000-00000000b001', s.title, s.type, s.status, s.ord,
       '11111111-1111-1111-1111-000000000002', current_date + s.ord,
       case when s.status = 'Completed' then now() - interval '3 days' end,
       case when s.status = 'Completed' then '11111111-1111-1111-1111-000000000002'::uuid end
from (values
  ('Complete Profile','Form'::step_type,'Completed'::step_status,1),
  ('Submit Documents','Document','Completed',2),
  ('Security Training','Course','Completed',3),
  ('Company Orientation','Meeting','Completed',4),
  ('Meet Manager','Meeting','Pending',5),
  ('First Week Review','Task','Pending',6)
) as s(title, type, status, ord);

-- Peppermint Patty: 2 of 4 done
insert into onboarding_steps (organisation_id, onboarding_id, title, type, status, sort_order, assigned_to, due_date, completed_at, completed_by)
select 'aaaaaaaa-0000-0000-0000-000000000001','a2000000-0000-0000-0000-00000000b002', s.title, s.type, s.status, s.ord,
       '11111111-1111-1111-1111-000000000005', current_date + s.ord,
       case when s.status = 'Completed' then now() - interval '5 days' end,
       case when s.status = 'Completed' then '11111111-1111-1111-1111-000000000005'::uuid end
from (values
  ('Complete Profile','Form'::step_type,'Completed'::step_status,1),
  ('Submit Documents','Document','Completed',2),
  ('Systems Walkthrough','Meeting','Pending',3),
  ('First Week Review','Task','Pending',4)
) as s(title, type, status, ord);

-- Schroeder: fully complete
insert into onboarding_steps (organisation_id, onboarding_id, title, type, status, sort_order, assigned_to, due_date, completed_at, completed_by)
select 'aaaaaaaa-0000-0000-0000-000000000001','a2000000-0000-0000-0000-00000000b003', s.title, s.type, 'Completed'::step_status, s.ord,
       '11111111-1111-1111-1111-000000000003', current_date - 175, now() - interval '175 days',
       '11111111-1111-1111-1111-000000000003'
from (values
  ('Complete Profile','Form'::step_type,1),
  ('Submit Documents','Document',2),
  ('Security Training','Course',3),
  ('Company Orientation','Meeting',4),
  ('Meet Manager','Meeting',5),
  ('First Week Review','Task',6)
) as s(title, type, ord);

-- Linus: behind schedule
insert into onboarding_steps (organisation_id, onboarding_id, title, type, status, sort_order, assigned_to, due_date, completed_at, completed_by)
select 'bbbbbbbb-0000-0000-0000-000000000001','b2000000-0000-0000-0000-00000000b001', s.title, s.type, s.status, s.ord,
       '22222222-2222-2222-2222-000000000002', current_date - 20,
       case when s.status = 'Completed' then now() - interval '30 days' end,
       case when s.status = 'Completed' then '22222222-2222-2222-2222-000000000002'::uuid end
from (values
  ('Complete Profile','Form'::step_type,'Completed'::step_status,1),
  ('Submit Documents','Document','Pending',2),
  ('Systems Walkthrough','Meeting','Pending',3),
  ('First Week Review','Task','Pending',4)
) as s(title, type, status, ord);

update employee_onboarding set status = 'Overdue'
 where status <> 'Completed' and target_completion_date < current_date;

-- ---------------------------------------------------------------- activity
insert into activity_log (organisation_id, actor_id, action, entity_type, entity_id, metadata, created_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-000000000002','completed_course','course','c0000000-0000-0000-0000-00000000c002','{"title":"JavaScript Essentials"}', now() - interval '18 days'),
  ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-000000000002','uploaded_document','document',null,'{"name":"React Native Notes"}', now() - interval '12 days'),
  ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-000000000002','completed_onboarding_step','onboarding_step',null,'{"title":"Company Orientation"}', now() - interval '3 days'),
  ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-000000000001','created_course','course','c0000000-0000-0000-0000-00000000c006','{"title":"Leadership Foundations"}', now() - interval '10 days'),
  ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-000000000001','started_onboarding','employee_onboarding','a2000000-0000-0000-0000-00000000b002','{"employee":"Peppermint Patty"}', now() - interval '12 days'),
  ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-000000000003','completed_task','task',null,'{"title":"Prepare workshop"}', now() - interval '6 days'),
  ('bbbbbbbb-0000-0000-0000-000000000001','22222222-2222-2222-2222-000000000001','created_event','event','f0000000-0000-0000-0000-00000000e001','{"title":"Training Session"}', now() - interval '4 days'),
  ('bbbbbbbb-0000-0000-0000-000000000001','22222222-2222-2222-2222-000000000003','completed_course','course','d0000000-0000-0000-0000-00000000c001','{"title":"Workplace Safety"}', now() - interval '5 days');
