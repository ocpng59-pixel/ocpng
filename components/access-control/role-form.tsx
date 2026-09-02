'use client';

import { useActionState } from 'react';
import { ActionMessage } from '@/components/access-control/action-message';
import type {
  AccessControlActionState,
  RoleDetail,
} from '@/lib/access-control/types';

type RoleAction = (
  previousState: AccessControlActionState,
  formData: FormData,
) => Promise<AccessControlActionState>;

const INITIAL_STATE: AccessControlActionState = { ok: false, message: '' };

function FieldError({ message }: { message?: string }) {
  return message ? <div className="oc-field-error">{message}</div> : null;
}

export function RoleForm({
  action,
  role,
  disabled = false,
}: {
  action: RoleAction;
  role?: Pick<RoleDetail, 'id' | 'code' | 'name' | 'description' | 'roleType'>;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);
  return (
    <form action={formAction} className="oc-card oc-form-grid">
      {role ? <input type="hidden" name="roleId" value={role.id} /> : null}
      <div>
        <label htmlFor="role-code">Role code</label>
        <input id="role-code" name="code" defaultValue={role?.code ?? ''} disabled={disabled} required />
        <FieldError message={!state.ok ? state.fieldErrors?.code : undefined} />
      </div>
      <div>
        <label htmlFor="role-name">Role name</label>
        <input id="role-name" name="name" defaultValue={role?.name ?? ''} disabled={disabled} required />
        <FieldError message={!state.ok ? state.fieldErrors?.name : undefined} />
      </div>
      <div>
        <label htmlFor="role-type">Role type</label>
        <select id="role-type" name="roleType" defaultValue={role?.roleType ?? 'operational'} disabled={disabled}>
          <option value="operational">Operational</option>
          <option value="administrative">Administrative</option>
          <option value="training">Training</option>
        </select>
        <FieldError message={!state.ok ? state.fieldErrors?.roleType : undefined} />
      </div>
      <div className="oc-form-span">
        <label htmlFor="role-description">Description</label>
        <textarea id="role-description" name="description" rows={4} defaultValue={role?.description ?? ''} disabled={disabled} />
        <FieldError message={!state.ok ? state.fieldErrors?.description : undefined} />
      </div>
      <div className="oc-form-span">
        <label htmlFor="role-reason">Administrative reason</label>
        <input id="role-reason" name="reason" minLength={3} maxLength={500} disabled={disabled} required />
        <p className="oc-muted">Required for the immutable access-control audit event.</p>
        <FieldError message={!state.ok ? state.fieldErrors?.reason : undefined} />
      </div>
      <div className="oc-form-span">
        <ActionMessage state={state} />
        <button className="oc-button" type="submit" disabled={disabled || pending}>
          {pending ? 'Saving…' : role ? 'Save role changes' : 'Create role'}
        </button>
      </div>
    </form>
  );
}

function LifecycleForm({
  action,
  roleId,
  isActive,
  mode,
  disabled,
}: {
  action: RoleAction;
  roleId: string;
  isActive: boolean;
  mode: 'status' | 'retire';
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);
  const activating = !isActive;
  return (
    <form action={formAction} className="oc-card oc-form-grid">
      <input type="hidden" name="roleId" value={roleId} />
      {mode === 'status' ? <input type="hidden" name="isActive" value={activating ? 'true' : 'false'} /> : null}
      <div className="oc-form-span">
        <label htmlFor={`${mode}-${roleId}-reason`}>Administrative reason</label>
        <input id={`${mode}-${roleId}-reason`} name="reason" minLength={3} maxLength={500} disabled={disabled} required />
      </div>
      <div className="oc-form-span">
        <ActionMessage state={state} />
        <button className="oc-button" type="submit" disabled={disabled || pending}>
          {pending
            ? 'Applying…'
            : mode === 'retire'
              ? 'Retire role'
              : activating
                ? 'Activate role'
                : 'Deactivate role'}
        </button>
      </div>
    </form>
  );
}

export function RoleLifecycleControls({
  roleId,
  isActive,
  disabled,
  setActiveAction,
  retireAction,
}: {
  roleId: string;
  isActive: boolean;
  disabled: boolean;
  setActiveAction: RoleAction;
  retireAction: RoleAction;
}) {
  return (
    <div className="oc-admin-grid">
      <LifecycleForm action={setActiveAction} roleId={roleId} isActive={isActive} mode="status" disabled={disabled} />
      <LifecycleForm action={retireAction} roleId={roleId} isActive={isActive} mode="retire" disabled={disabled} />
    </div>
  );
}
