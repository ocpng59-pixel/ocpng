export function StatusBadge({ children, protectedValue = false }: { children: React.ReactNode; protectedValue?: boolean }) {
  return <span className={`oc-badge${protectedValue ? ' protected' : ''}`}>{children}</span>;
}
