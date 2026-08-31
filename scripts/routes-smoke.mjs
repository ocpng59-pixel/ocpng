import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../', import.meta.url);
const requiredFiles = [
  'app/layout.tsx','app/page.tsx','app/login/page.tsx','app/forgot-password/page.tsx','app/set-password/page.tsx',
  'app/dashboard/layout.tsx','app/dashboard/page.tsx','app/dashboard/[...module]/page.tsx',
  'components/app-shell.tsx','components/sidebar.tsx','components/module-landing.tsx','lib/config/module-pages.ts','lib/supabase/browser.ts','lib/supabase/server.ts'
];
for (const rel of requiredFiles) assert.ok(fs.existsSync(path.join(root.pathname, rel)), `missing route or shell file: ${rel}`);
const definitions = fs.readFileSync(path.join(root.pathname,'lib/config/module-pages.ts'),'utf8');
const hrefs = [
'/dashboard/complaints','/dashboard/complaints/new','/dashboard/complaints/referrals','/dashboard/complaints/administrative','/dashboard/complaints/human-rights','/dashboard/complaints/police','/dashboard/intake','/dashboard/investigations','/dashboard/investigations/plans','/dashboard/investigations/evidence','/dashboard/investigations/right-to-be-heard','/dashboard/investigations/findings','/dashboard/leadership','/dashboard/leadership/investigations','/dashboard/leadership/referrals','/dashboard/leadership/tribunals','/dashboard/annual-statements','/dashboard/annual-statements/variance-review','/dashboard/government-bodies','/dashboard/oversight','/dashboard/oversight/inspections','/dashboard/oversight/systemic-issues','/dashboard/compliance','/dashboard/compliance/actions','/dashboard/compliance/escalations','/dashboard/commission','/dashboard/commission/decisions','/dashboard/legal','/dashboard/legal/matters','/dashboard/intelligence','/dashboard/intelligence/analysis','/dashboard/reports','/dashboard/tasks','/dashboard/notifications','/dashboard/users','/dashboard/users/roles','/dashboard/audit-log','/dashboard/settings'];
for (const href of hrefs) assert.ok(definitions.includes(`'${href}'`), `missing module definition: ${href}`);
assert.doesNotMatch(definitions.toLowerCase(), /ff3|ff4|budget allocation|expense ledger/);
assert.match(definitions, /LEADERSHIP_RESTRICTED/);
assert.match(definitions, /ANNUAL_STATEMENT_SECRET/);
assert.match(definitions, /INTELLIGENCE_SECRET/);
assert.match(definitions, /LEGAL_PRIVILEGE/);
console.log(`WASDOK 360 route smoke checks: PASS (${hrefs.length} configured module surfaces)`);
