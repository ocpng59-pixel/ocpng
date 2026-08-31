export function MetricCard({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return <div className="oc-card oc-metric"><span>{label}</span><strong>{value}</strong>{note ? <span>{note}</span> : null}</div>;
}
