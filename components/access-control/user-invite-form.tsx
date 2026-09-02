'use client';

import { useActionState } from 'react';
import { inviteUserAction } from '@/app/dashboard/users/actions';
import { ActionMessage } from '@/components/access-control/action-message';
import type { AccessControlActionState } from '@/lib/access-control/types';

const INITIAL_STATE: AccessControlActionState = { ok: true, message: '' };

export function UserInviteForm() {
  const [state, formAction, pending] = useActionState(inviteUserAction, INITIAL_STATE);

  return (
    <form action={formAction} className="oc-form oc-form-grid">
      <div>
        <label htmlFor="invite-email">Email</label>
        <input id="invite-email" name="email" type="email" required autoComplete="email" />
      </div>
      <div>
        <label htmlFor="invite-display-name">Display name</label>
        <input id="invite-display-name" name="displayName" required maxLength={160} />
      </div>
      <div className="oc-admin-span">
        <label htmlFor="invite-reason">Administrative reason</label>
        <textarea id="invite-reason" name="reason" required minLength={3} maxLength={500} rows={3} />
      </div>
      <div className="oc-admin-span oc-inline-actions">
        <button className="oc-button" type="submit" disabled={pending}>Invite user</button>
      </div>
      <div className="oc-admin-span"><ActionMessage state={state} /></div>
    </form>
  );
}
