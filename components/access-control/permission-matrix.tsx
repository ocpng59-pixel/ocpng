'use client';

import { useActionState } from 'react';
import { ActionMessage } from '@/components/access-control/action-message';
import type {
  AccessControlActionState,
  PermissionSummary,
} from '@/lib/access-control/types';

type PermissionAction = (
  previousState: AccessControlActionState,
  formData: FormData,
) => Promise<AccessControlActionState>;

const INITIAL_STATE: AccessControlActionState = { ok: false, message: '' };

function PermissionRow({
  roleId,
  permission,
  granted,
  disabled,
  action,
}: {
  roleId: string;
  permission: PermissionSummary;
  granted: boolean;
  disabled: boolean;
  action: PermissionAction;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);
  return (
    <tr>
      <td><code>{permission.code}</code></td>
      <td>{permission.name}</td>
      <td>{permission.classification}</td>
      <td>{granted ? 'Granted' : 'Not granted'}</td>
      <td>
        <form action={formAction} className="oc-inline-actions">
          <input type="hidden" name="roleId" value={roleId} />
          <input type="hidden" name="permissionCode" value={permission.code} />
          <label className="oc-visually-hidden" htmlFor={`reason-${roleId}-${permission.id}`}>Administrative reason</label>
          <input
            id={`reason-${roleId}-${permission.id}`}
            name="reason"
            minLength={3}
            maxLength={500}
            placeholder="Administrative reason"
            disabled={disabled}
            required
          />
          <button className="oc-button oc-button-compact" type="submit" disabled={disabled || pending}>
            {pending ? 'Applying…' : granted ? 'Revoke' : 'Grant'}
          </button>
        </form>
        <ActionMessage state={state} />
      </td>
    </tr>
  );
}

export function PermissionMatrix({
  roleId,
  permissions,
  grantedCodes,
  disabled,
  grantAction,
  revokeAction,
}: {
  roleId: string;
  permissions: PermissionSummary[];
  grantedCodes: string[];
  disabled: boolean;
  grantAction: PermissionAction;
  revokeAction: PermissionAction;
}) {
  const granted = new Set(grantedCodes);
  const grouped = permissions.reduce<Record<string, PermissionSummary[]>>((result, permission) => {
    (result[permission.domain] ??= []).push(permission);
    return result;
  }, {});

  return (
    <div className="oc-admin-grid">
      {Object.entries(grouped).map(([domain, domainPermissions]) => (
        <section className="oc-card" key={domain}>
          <h3>{domain}</h3>
          <div className="oc-table-scroll">
            <table className="oc-admin-table">
              <thead>
                <tr><th>Permission</th><th>Name</th><th>Classification</th><th>Status</th><th>Action</th></tr>
              </thead>
              <tbody>
                {domainPermissions.map((permission) => {
                  const isGranted = granted.has(permission.code);
                  return (
                    <PermissionRow
                      key={permission.id}
                      roleId={roleId}
                      permission={permission}
                      granted={isGranted}
                      disabled={disabled}
                      action={isGranted ? revokeAction : grantAction}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
