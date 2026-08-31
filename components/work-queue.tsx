export function WorkQueue({ items }: { items: { title: string; detail: string }[] }) {
  return <div className="oc-card"><h3>Priority work queue</h3><ul className="oc-list">{items.map((i) => <li key={i.title}><strong>{i.title}</strong> — {i.detail}</li>)}</ul></div>;
}
