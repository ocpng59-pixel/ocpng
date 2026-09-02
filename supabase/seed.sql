-- DEMO — fictional UAT seed data only. No record below represents a real person, leader, complaint or agency matter.
insert into public.roles (code,name,is_system) values
('chief_ombudsman','Chief Ombudsman',true),('ombudsman','Ombudsman',true),('secretary','Secretary',true),('counsel','Counsel',true),
('director','Director',true),('team_leader','Team Leader',true),('senior_investigator','Senior Investigator',true),('investigator','Investigator',true),('system_administrator','System Administrator',true)
on conflict (code) do nothing;

insert into public.roles (code,name,description,is_system,is_active,role_type,metadata)
values (
  'training_super_admin',
  'Training Super Administrator',
  'DEMO/UAT application-wide functional role; not an infrastructure superuser.',
  false,
  true,
  'training',
  '{"demo_role":true}'::jsonb
)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    role_type = 'training',
    is_active = true,
    is_system = false,
    metadata = public.roles.metadata || '{"demo_role":true}'::jsonb;

insert into public.permissions (code,name,domain) values
('dashboard.view','View dashboard','Dashboard'),('complaints.view','View complaints','Complaints'),('complaints.create','Create complaints','Complaints'),('complaints.screen','Screen complaints','Complaints'),
('investigations.view','View investigations','Investigations'),('investigations.manage','Manage investigations','Investigations'),('evidence.manage','Manage evidence','Investigations'),
('leadership.view_restricted','View Leadership matters','Leadership'),('leadership.manage','Manage Leadership matters','Leadership'),
('annual_statements.view_secret','View Annual Statements','Leadership'),('annual_statements.manage','Manage Annual Statements','Leadership'),
('oversight.view','View oversight','Oversight'),('oversight.manage','Manage oversight','Oversight'),('compliance.view','View compliance','Compliance'),('compliance.manage','Manage compliance','Compliance'),
('commission.view','View Commission records','Commission'),('commission.record_decision','Record Commission decisions','Commission'),
('legal.view_privileged','View privileged legal matters','Legal'),('legal.manage','Manage legal matters','Legal'),
('intelligence.view_secret','View secret intelligence','Intelligence'),('intelligence.manage','Manage intelligence','Intelligence'),
('reports.view','View reports','Reporting'),('tasks.view','View tasks','Workflow'),('notifications.view','View notifications','Workflow'),
('admin.manage_users','Manage users','Administration'),('admin.manage_roles','Manage roles','Administration'),('admin.manage_settings','Manage settings','Administration'),('audit.view','View audit events','Audit')
on conflict (code) do nothing;

insert into public.security_compartments (code,name) values
('CONFIDENTIAL','Confidential'),('RESTRICTED','Restricted'),('LEADERSHIP_RESTRICTED','Leadership Restricted'),('ANNUAL_STATEMENT_SECRET','Annual Statement Secret'),('INTELLIGENCE_SECRET','Intelligence Secret'),('LEGAL_PRIVILEGE','Legal Privilege')
on conflict (code) do nothing;

insert into public.government_bodies (name,body_type,province,metadata) values
('DEMO Provincial Service Authority','DEMO Agency','DEMO Province','{"demo":true}'::jsonb);

insert into public.people (full_name,person_type,metadata) values
('DEMO Citizen A','DEMO Complainant','{"demo":true}'::jsonb),('DEMO Leader A','DEMO Leader','{"demo":true}'::jsonb);
