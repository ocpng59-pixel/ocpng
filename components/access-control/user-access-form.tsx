'use client';

import { useActionState, type ReactNode } from 'react';
import {
  assignUserRoleAction,
  grantDataScopeAction,
  grantUserCompartmentAction,
  revokeDataScopeAction,
  revokeUserCompartmentAction,
  revokeUserRoleAction,
  setUserActiveAction,
} from '@/app/dashboard/users/actions';
import { ActionMessage } from '@/components/access-control/action-message';
import type {
  AccessControlActionState,
  CompartmentSummary,
  RoleSummary,
  UserAccess,
} from '@/lib/access-control/types';

const INITIAL_STATE: AccessControlActionState = { ok: true, message: '' };
type MutationAction = (
  state: AccessControlActionState,
  formData: FormData,
) => Promise<AccessControlActionState>;

function MutationForm({
  action,
  children,
  buttonLabel,
  danger = false,
}: {
  action: MutationAction;
  children: ReactNode;
  buttonLabel: string;
  danger?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);
  return (
    <form action={formAction} className="oc-access-mutation">
      {children}
      <label>
        Administrative reason
        <textarea name="reason" required minLength={3} maxLength={500} rows={2} />
      </label>
      <button className={danger ? 'oc-button oc-button-danger' : 'oc-button'} type="submit" disabled={pending}>
        {buttonLabel}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

export function UserAccessForm({
  access,
  availableRoles,
  compartments,
  canManageRoles,
}: {
  access: UserAccess;
  availableRoles: RoleSummary[];
  compartments: CompartmentSummary[];
  canManageRoles: boolean;
}) {
  const activeRoleIds = new Set(access.roles.filter((role) => role.isActive).map((role) => role.roleId));
  const assignableRoles = availableRoles.filter((role) => role.isActive && !role.isRetired && !activeRoleIds.has(role.id));
  const activeCompartments = new Set(access.compartments.filter((item) => item.isActive).map((item) => item.code));
  const grantableCompartments = compartments.filter((item) => !activeCompartments.has(item.code));

  return (
    <div className="oc-admin-grid">
      <section className="oc-card">
        <h2>Roles</h2>
        <p className="oc-muted">Application roles determine functional permissions. Role changes require both user and role administration authority.</p>
        {access.roles.filter((role) => role.isActive).map((role) => (
          <div className="oc-access-row" key={role.assignmentId}>
            <div><strong>{role.name}</strong><br /><code>{role.code}</code></div>
            {canManageRoles ? (
              <MutationForm action={revokeUserRoleAction} buttonLabel="Revoke role" danger>
                <input type="hidden" name="userId" value={access.user.id} />
                <input type="hidden" name="roleId" value={role.roleId} />
              </MutationForm>
            ) : null}
          </div>
        ))}
        {canManageRoles && assignableRoles.length > 0 ? (
          <MutationForm action={assignUserRoleAction} buttonLabel="Assign role">
            <input type="hidden" name="userId" value={access.user.id} />
            <label>Role
              <select name="roleId" required defaultValue="">
                <option value="" disabled>Select role</option>
                {assignableRoles.map((role) => <option key={role.id} value={role.id}>{role.name} ({role.code})</option>)}
              </select>
            </label>
          </MutationForm>
        ) : null}
        {!canManageRoles ? <p className="oc-muted">Role changes require admin.manage_roles.</p> : null}
      </section>

      <section className="oc-card">
        <h2>Data scopes</h2>
        <p className="oc-muted">Scopes constrain organisational or operational data visibility.</p>
        {access.scopes.filter((scope) => scope.isActive).map((scope) => (
          <div className="oc-access-row" key={scope.assignmentId}>
            <div><strong>{scope.scopeCode}</strong><br /><span>{scope.scopeType}</span></div>
            <MutationForm action={revokeDataScopeAction} buttonLabel="Revoke scope" danger>
              <input type="hidden" name="userId" value={access.user.id} />
              <input type="hidden" name="scopeCode" value={scope.scopeCode} />
            </MutationForm>
          </div>
        ))}
        <MutationForm action={grantDataScopeAction} buttonLabel="Grant scope">
          <input type="hidden" name="userId" value={access.user.id} />
          <label>Scope code<input name="scopeCode" required maxLength={100} /></label>
          <label>Scope type<input name="scopeType" required maxLength={100} /></label>
        </MutationForm>
      </section>

      <section className="oc-card">
        <h2>Security compartments</h2>
        <p className="oc-muted">Compartments enforce need-to-know access in addition to functional permissions.</p>
        {access.compartments.filter((item) => item.isActive).map((item) => (
          <div className="oc-access-row" key={item.assignmentId}>
            <div><strong>{item.name}</strong><br /><code>{item.code}</code></div>
            {canManageRoles ? (
              <MutationForm action={revokeUserCompartmentAction} buttonLabel="Revoke compartment" danger>
                <input type="hidden" name="userId" value={access.user.id} />
                <input type="hidden" name="compartment" value={item.code} />
              </MutationForm>
            ) : null}
          </div>
        ))}
        {canManageRoles && grantableCompartments.length > 0 ? (
          <MutationForm action={grantUserCompartmentAction} buttonLabel="Grant compartment">
            <input type="hidden" name="userId" value={access.user.id} />
            <label>Compartment
              <select name="compartment" required defaultValue="">
                <option value="" disabled>Select compartment</option>
                {grantableCompartments.map((item) => <option key={item.id} value={item.code}>{item.name} ({item.code})</option>)}
              </select>
            </label>
          </MutationForm>
        ) : null}
        {!canManageRoles ? <p className="oc-muted">Compartment changes require admin.manage_roles in addition to admin.manage_users.</p> : null}
      </section>

      <section className="oc-card">
        <h2>Account status</h2>
        <p><strong>Current status:</strong> {access.user.isActive ? 'Active' : 'Suspended'}</p>
        <MutationForm
          action={setUserActiveAction}
          buttonLabel={access.user.isActive ? 'Suspend user' : 'Activate user'}
          danger={access.user.isActive}
        >
          <input type="hidden" name="userId" value={access.user.id} />
          <input type="hidden" name="isActive" value={access.user.isActive ? 'false' : 'true'} />
        </MutationForm>
      </section>
    </div>
  );
}
