import type { ModulePageDefinition } from '@/lib/config/module-pages';
import { StatusBadge } from './status-badge';

export function ModuleLanding({ page }: { page: ModulePageDefinition }) {
  const protectedValue = !['PUBLIC','INTERNAL'].includes(page.classification);
  return <><header className="oc-page-head"><div><h1>{page.title}</h1><p>{page.description}</p></div><StatusBadge protectedValue={protectedValue}>{page.classification}</StatusBadge></header>
    {protectedValue ? <div className="oc-notice oc-protected-notice">Need-to-know access applies. Permission alone does not override organisational scope, case assignment or the required security compartment.</div> : null}
    <div className="oc-actions">{page.actions.map((a)=><span className="oc-action" key={a}>{a}</span>)}</div>
    <div className="oc-columns"><div className="oc-card"><h3>Controlled workflow</h3><ol className="oc-list">{page.stages.map((s)=><li key={s}>{s}</li>)}</ol></div><div className="oc-card"><h3>Release 1 control posture</h3><ul className="oc-list"><li>Authorised human officers retain decision authority.</li><li>Protected reads and exports are auditable.</li><li>Evidence and decision provenance are preserved.</li><li>Prototype data is explicitly marked DEMO.</li></ul></div></div></>;
}
