export type AccessControlActionState =
  | { ok: true; message: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

export type RoleType = 'operational' | 'administrative' | 'training';

export type SecurityClassification =
  | 'PUBLIC'
  | 'INTERNAL'
  | 'CONFIDENTIAL'
  | 'RESTRICTED'
  | 'LEADERSHIP_RESTRICTED'
  | 'ANNUAL_STATEMENT_SECRET'
  | 'INTELLIGENCE_SECRET'
  | 'LEGAL_PRIVILEGE';

export type RoleSummary = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  roleType: RoleType;
  isActive: boolean;
  isRetired: boolean;
  userCount: number;
  permissionCount: number;
};

export type PermissionSummary = {
  id: string;
  code: string;
  name: string;
  domain: string;
  classification: SecurityClassification;
};

export type CompartmentSummary = {
  id: string;
  code: SecurityClassification;
  name: string;
  description: string | null;
};

export type RoleDetail = RoleSummary & {
  permissions: PermissionSummary[];
  actorHoldsRole: boolean;
};

export type UserSummary = {
  id: string;
  displayName: string;
  email: string | null;
  isActive: boolean;
  classification: SecurityClassification;
  organisationScope: string | null;
  roleCount: number;
  compartmentCount: number;
};

export type UserRoleAssignment = {
  assignmentId: string;
  roleId: string;
  code: string;
  name: string;
  roleType: RoleType;
  isActive: boolean;
};

export type UserScopeAssignment = {
  assignmentId: string;
  scopeCode: string;
  scopeType: string;
  isActive: boolean;
};

export type UserCompartmentAssignment = {
  assignmentId: string;
  compartmentId: string;
  code: SecurityClassification;
  name: string;
  isActive: boolean;
};

export type UserAccess = {
  user: UserSummary;
  roles: UserRoleAssignment[];
  effectivePermissions: string[];
  scopes: UserScopeAssignment[];
  compartments: UserCompartmentAssignment[];
  isSelf: boolean;
};

export type RoleFormInput = {
  code: string;
  name: string;
  description: string;
  roleType: RoleType;
  reason: string;
};

export type ScopeFormInput = {
  scopeCode: string;
  scopeType: string;
  reason: string;
};
