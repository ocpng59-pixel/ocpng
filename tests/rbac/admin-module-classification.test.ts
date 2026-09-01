import { describe, expect, it } from 'vitest';
import { MODULE_PAGES } from '@/lib/config/module-pages';

describe('administration module classification consistency', () => {
  it('keeps permission-gated administration pages INTERNAL and audit logs RESTRICTED', () => {
    expect(MODULE_PAGES['/dashboard/users'].classification).toBe('INTERNAL');
    expect(MODULE_PAGES['/dashboard/users/roles'].classification).toBe('INTERNAL');
    expect(MODULE_PAGES['/dashboard/settings'].classification).toBe('INTERNAL');
    expect(MODULE_PAGES['/dashboard/audit-log'].classification).toBe('RESTRICTED');
  });
});
