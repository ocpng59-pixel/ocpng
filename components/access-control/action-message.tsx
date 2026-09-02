import type { AccessControlActionState } from '@/lib/access-control/types';

export function ActionMessage({ state }: { state: AccessControlActionState }) {
  if (!state.message) return null;
  return (
    <div
      className={state.ok ? 'oc-notice oc-access-success' : 'oc-notice oc-access-error'}
      role="status"
      aria-live="polite"
    >
      {state.message}
    </div>
  );
}
