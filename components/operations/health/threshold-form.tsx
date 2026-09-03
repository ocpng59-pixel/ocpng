import { setHealthThresholdAction, setHealthThresholdActiveAction } from '@/app/dashboard/operations/system-health/actions';
import { HEALTH_METRIC_CATALOG } from '@/lib/operations/health/catalog';
import type { HealthThresholdView } from '@/lib/operations/health/queries';

export function ThresholdForm({ thresholds }: { thresholds: HealthThresholdView[] }) {
  const options = HEALTH_METRIC_CATALOG;
  return <section className="oc-card">
    <h2>Threshold administration</h2>
    <p>Only allowlisted catalogue metrics can be configured. Every change requires a reason and is audited.</p>
    <form action={setHealthThresholdAction}>
      <label>Metric<select name="metricCode" required>{options.map((metric) => <option key={metric.code} value={metric.code}>{metric.code} ({metric.unit})</option>)}</select></label>
      <label>Warning value<input name="warningValue" type="number" step="any" required /></label>
      <label>Critical value<input name="criticalValue" type="number" step="any" required /></label>
      <label>Direction<select name="direction" required><option value="ABOVE_IS_BAD">Above is bad</option><option value="BELOW_IS_BAD">Below is bad</option></select></label>
      <label>Reason<textarea name="reason" minLength={3} maxLength={500} required /></label>
      <button className="oc-button" type="submit">Save threshold</button>
    </form>
    {thresholds.length > 0 ? <>
      <h3>Configured thresholds</h3>
      <ul>{thresholds.map((threshold) => <li key={threshold.id}>
        <strong>{threshold.metricCode}</strong> · warning {threshold.warningValue} · critical {threshold.criticalValue} · {threshold.direction} · {threshold.isActive ? 'Active' : 'Inactive'}
        <form action={setHealthThresholdActiveAction}>
          <input type="hidden" name="thresholdId" value={threshold.id} />
          <input type="hidden" name="active" value={threshold.isActive ? 'false' : 'true'} />
          <label>Reason<input name="reason" minLength={3} maxLength={500} required /></label>
          <button type="submit">{threshold.isActive ? 'Deactivate' : 'Activate'}</button>
        </form>
      </li>)}</ul>
    </> : <p>No thresholds configured.</p>}
  </section>;
}
