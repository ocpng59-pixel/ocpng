import type { NavigationSection } from './types';

export const NAVIGATION: NavigationSection[] = [
  { title: 'Dashboard', items: [
    { title: 'Executive Overview', href: '/dashboard', permissions: ['dashboard.view'] },
    { title: 'My Work', href: '/dashboard/tasks', permissions: ['tasks.view'] },
    { title: 'Alerts / Overdue Actions', href: '/dashboard/notifications', permissions: ['notifications.view'] },
  ]},
  { title: 'Complaints', items: [
    { title: 'New Complaint', href: '/dashboard/complaints/new', permissions: ['complaints.create'] },
    { title: 'Intake & Screening', href: '/dashboard/intake', permissions: ['complaints.screen'] },
    { title: 'Complaint Register', href: '/dashboard/complaints', permissions: ['complaints.view'] },
    { title: 'Referrals', href: '/dashboard/complaints/referrals', permissions: ['complaints.view'] },
    { title: 'Administrative Complaints', href: '/dashboard/complaints/administrative', permissions: ['complaints.view'] },
    { title: 'Human Rights / Discrimination', href: '/dashboard/complaints/human-rights', permissions: ['complaints.view'] },
    { title: 'Police Oversight', href: '/dashboard/complaints/police', permissions: ['complaints.view'] },
  ]},
  { title: 'Investigations', items: [
    { title: 'My Cases', href: '/dashboard/investigations', permissions: ['investigations.view'] },
    { title: 'Investigation Plans', href: '/dashboard/investigations/plans', permissions: ['investigations.manage'] },
    { title: 'Evidence Register', href: '/dashboard/investigations/evidence', permissions: ['evidence.manage'], classification: 'CONFIDENTIAL' },
    { title: 'Right to be Heard', href: '/dashboard/investigations/right-to-be-heard', permissions: ['investigations.manage'], classification: 'CONFIDENTIAL' },
    { title: 'Findings & Closure', href: '/dashboard/investigations/findings', permissions: ['investigations.manage'], classification: 'CONFIDENTIAL' },
  ]},
  { title: 'Leadership', items: [
    { title: 'Leader Registry', href: '/dashboard/leadership', permissions: ['leadership.view_restricted'], classification: 'LEADERSHIP_RESTRICTED' },
    { title: 'Leadership Investigations', href: '/dashboard/leadership/investigations', permissions: ['leadership.manage'], classification: 'LEADERSHIP_RESTRICTED' },
    { title: 'Annual Statements', href: '/dashboard/annual-statements', permissions: ['annual_statements.view_secret'], classification: 'ANNUAL_STATEMENT_SECRET' },
    { title: 'Variance & Anomaly Review', href: '/dashboard/annual-statements/variance-review', permissions: ['annual_statements.manage'], classification: 'ANNUAL_STATEMENT_SECRET' },
    { title: 'Public Prosecutor Referrals', href: '/dashboard/leadership/referrals', permissions: ['leadership.manage'], classification: 'LEADERSHIP_RESTRICTED' },
    { title: 'Tribunal Matters', href: '/dashboard/leadership/tribunals', permissions: ['leadership.manage'], classification: 'LEADERSHIP_RESTRICTED' },
  ]},
  { title: 'Government Oversight', items: [
    { title: 'Government Bodies Registry', href: '/dashboard/government-bodies', permissions: ['oversight.view'] },
    { title: 'Monitoring & Evaluation', href: '/dashboard/oversight', permissions: ['oversight.view'] },
    { title: 'Inspections', href: '/dashboard/oversight/inspections', permissions: ['oversight.manage'] },
    { title: 'Systemic Issues / Own Motion', href: '/dashboard/oversight/systemic-issues', permissions: ['oversight.manage'], classification: 'CONFIDENTIAL' },
  ]},
  { title: 'Compliance', items: [
    { title: 'Recommendations', href: '/dashboard/compliance', permissions: ['compliance.view'] },
    { title: 'Corrective Actions', href: '/dashboard/compliance/actions', permissions: ['compliance.manage'] },
    { title: 'Overdue & Escalations', href: '/dashboard/compliance/escalations', permissions: ['compliance.manage'] },
  ]},
  { title: 'Commission', items: [
    { title: 'Meetings & Submissions', href: '/dashboard/commission', permissions: ['commission.view'], classification: 'RESTRICTED' },
    { title: 'Decisions & Actions', href: '/dashboard/commission/decisions', permissions: ['commission.record_decision'], classification: 'RESTRICTED' },
  ]},
  { title: 'Legal', items: [
    { title: 'Legal Matters', href: '/dashboard/legal', permissions: ['legal.view_privileged'], classification: 'LEGAL_PRIVILEGE' },
    { title: 'Constitutional / Litigation / Tribunal', href: '/dashboard/legal/matters', permissions: ['legal.manage'], classification: 'LEGAL_PRIVILEGE' },
  ]},
  { title: 'Intelligence', items: [
    { title: 'Intelligence Reports', href: '/dashboard/intelligence', permissions: ['intelligence.view_secret'], classification: 'INTELLIGENCE_SECRET' },
    { title: 'Sources / Entities / Analysis', href: '/dashboard/intelligence/analysis', permissions: ['intelligence.manage'], classification: 'INTELLIGENCE_SECRET' },
  ]},
  { title: 'Reports', items: [
    { title: 'Management & Statutory Reports', href: '/dashboard/reports', permissions: ['reports.view'] },
  ]},
  { title: 'Administration', items: [
    { title: 'Users', href: '/dashboard/users', permissions: ['admin.manage_users'] },
    { title: 'Roles & Permissions', href: '/dashboard/users/roles', permissions: ['admin.manage_roles'] },
    { title: 'Audit Logs', href: '/dashboard/audit-log', permissions: ['audit.view'], classification: 'RESTRICTED' },
    { title: 'System Settings', href: '/dashboard/settings', permissions: ['admin.manage_settings'] },
  ]},
];
