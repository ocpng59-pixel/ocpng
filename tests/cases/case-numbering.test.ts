import { describe, expect, it } from 'vitest';
import { formatCaseNumber } from '@/lib/cases/case-numbering';

describe('OCPNG case numbering', () => {
  it('formats all approved case prefixes and six-digit sequences', () => {
    expect(formatCaseNumber('administrative', 2026, 1)).toBe('OC-ADM-2026-000001');
    expect(formatCaseNumber('leadership', 2026, 2)).toBe('OC-LSP-2026-000002');
    expect(formatCaseNumber('human_rights', 2026, 3)).toBe('OC-ADHR-2026-000003');
    expect(formatCaseNumber('police_oversight', 2026, 4)).toBe('OC-POP-2026-000004');
    expect(formatCaseNumber('own_motion', 2026, 4)).toBe('OC-OWN-2026-000004');
    expect(formatCaseNumber('legal', 2026, 5)).toBe('OC-LEGAL-2026-000005');
  });
});
