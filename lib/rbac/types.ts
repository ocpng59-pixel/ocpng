export const SECURITY_CLASSIFICATIONS = [
  'PUBLIC',
  'INTERNAL',
  'CONFIDENTIAL',
  'RESTRICTED',
  'LEADERSHIP_RESTRICTED',
  'ANNUAL_STATEMENT_SECRET',
  'INTELLIGENCE_SECRET',
  'LEGAL_PRIVILEGE',
] as const;

export type SecurityClassification = (typeof SECURITY_CLASSIFICATIONS)[number];

export type PermissionCode =
  | 'dashboard.view'
  | 'complaints.view'
  | 'complaints.create'
  | 'complaints.screen'
  | 'investigations.view'
  | 'investigations.manage'
  | 'evidence.manage'
  | 'leadership.view_restricted'
  | 'leadership.manage'
  | 'annual_statements.view_secret'
  | 'annual_statements.manage'
  | 'oversight.view'
  | 'oversight.manage'
  | 'compliance.view'
  | 'compliance.manage'
  | 'commission.view'
  | 'commission.record_decision'
  | 'legal.view_privileged'
  | 'legal.manage'
  | 'intelligence.view_secret'
  | 'intelligence.manage'
  | 'reports.view'
  | 'tasks.view'
  | 'notifications.view'
  | 'admin.manage_users'
  | 'admin.manage_roles'
  | 'admin.manage_settings'
  | 'audit.view';

export interface NavigationItem {
  title: string;
  href: string;
  permissions: PermissionCode[];
  classification?: SecurityClassification;
}

export interface NavigationSection {
  title: string;
  items: NavigationItem[];
}
