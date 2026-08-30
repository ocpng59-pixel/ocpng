export const CASE_PREFIX = {
  administrative: 'ADM',
  leadership: 'LSP',
  human_rights: 'ADHR',
  police_oversight: 'POP',
  own_motion: 'OWN',
  legal: 'LEGAL',
} as const;

export type CaseType = keyof typeof CASE_PREFIX;

export function formatCaseNumber(type: CaseType, year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) throw new Error('Invalid case year.');
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999999) throw new Error('Invalid case sequence.');
  return `OC-${CASE_PREFIX[type]}-${year}-${String(sequence).padStart(6, '0')}`;
}
