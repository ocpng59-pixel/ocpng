export function RegisterTable({ headings, rows }: { headings: string[]; rows: string[][] }) {
  return <div className="oc-card"><table className="oc-table"><thead><tr>{headings.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row,i) => <tr key={i}>{row.map((cell,j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>;
}
