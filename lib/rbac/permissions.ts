import type { PermissionCode } from './types';

export interface PermissionDefinition {
  code: PermissionCode;
  label: string;
  domain: string;
  description: string;
}

export const PERMISSIONS: PermissionDefinition[] = [
  ['dashboard.view','View dashboard','Dashboard','View executive and personal work dashboards.'],
  ['complaints.view','View complaints','Complaints','Read complaint records within authorised scope.'],
  ['complaints.create','Create complaints','Complaints','Register a new complaint.'],
  ['complaints.screen','Screen complaints','Complaints','Perform intake, jurisdiction and screening decisions.'],
  ['investigations.view','View investigations','Investigations','Read investigation records within authorised scope.'],
  ['investigations.manage','Manage investigations','Investigations','Plan and manage authorised investigations.'],
  ['evidence.manage','Manage evidence','Investigations','Register and manage evidence and chain-of-custody events.'],
  ['leadership.view_restricted','View restricted Leadership matters','Leadership','Read Leadership matters when compartment access is also held.'],
  ['leadership.manage','Manage Leadership matters','Leadership','Manage authorised Leadership Code matters.'],
  ['annual_statements.view_secret','View Annual Statements','Leadership','Read Annual Statements when secret compartment access is also held.'],
  ['annual_statements.manage','Manage Annual Statements','Leadership','Administer Annual Statement lifecycle records.'],
  ['oversight.view','View government oversight','Oversight','Read government-body oversight records.'],
  ['oversight.manage','Manage government oversight','Oversight','Manage monitoring, inspections and systemic issues.'],
  ['compliance.view','View compliance','Compliance','Read recommendation and corrective-action compliance records.'],
  ['compliance.manage','Manage compliance','Compliance','Manage recommendation follow-up and escalation.'],
  ['commission.view','View Commission records','Commission','Read authorised Members of Commission records.'],
  ['commission.record_decision','Record Commission decisions','Commission','Record decisions and actions expressly made by the Commission.'],
  ['legal.view_privileged','View privileged legal records','Legal','Read legally privileged matters when compartment access is also held.'],
  ['legal.manage','Manage legal matters','Legal','Manage authorised legal, referral, tribunal and litigation records.'],
  ['intelligence.view_secret','View intelligence','Intelligence','Read intelligence records when compartment access is also held.'],
  ['intelligence.manage','Manage intelligence','Intelligence','Manage authorised intelligence records and analysis notes.'],
  ['reports.view','View reports','Reporting','View authorised management and statutory reporting.'],
  ['tasks.view','View tasks','Workflow','View assigned workflow tasks.'],
  ['notifications.view','View notifications','Workflow','View in-application alerts.'],
  ['admin.manage_users','Manage users','Administration','Manage user identities and assignments without bypassing protected data controls.'],
  ['admin.manage_roles','Manage roles','Administration','Manage roles, permissions and compartments.'],
  ['admin.manage_settings','Manage settings','Administration','Manage approved master data and system settings.'],
  ['audit.view','View audit logs','Audit','View authorised immutable audit events.'],
].map(([code,label,domain,description]) => ({ code: code as PermissionCode, label, domain, description }));
