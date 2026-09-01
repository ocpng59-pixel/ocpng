import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../', import.meta.url);
const requiredFiles = [
  'app/layout.tsx','app/page.tsx','app/login/page.tsx','app/forgot-password/page.tsx','app/set-password/page.tsx',
  'app/dashboard/layout.tsx','app/dashboard/page.tsx','app/dashboard/[...module]/page.tsx',
  'components/app-shell.tsx','components/sidebar.tsx','components/sign-out-control.tsx','components/module-landing.tsx','lib/config/module-pages.ts','lib/supabase/browser.ts','lib/supabase/server.ts','lib/rbac/authorized-navigation.ts','lib/rbac/module-route-authorization.ts'
];
for (const rel of requiredFiles) assert.ok(fs.existsSync(path.join(root.pathname, rel)), `missing route or shell file: ${rel}`);
const definitions = fs.readFileSync(path.join(root.pathname,'lib/config/module-pages.ts'),'utf8');
const dashboardLayout = fs.readFileSync(path.join(root.pathname,'app/dashboard/layout.tsx'),'utf8');
const moduleRoute = fs.readFileSync(path.join(root.pathname,'app/dashboard/[...module]/page.tsx'),'utf8');
const routeAuthorization = fs.readFileSync(path.join(root.pathname,'lib/rbac/module-route-authorization.ts'),'utf8');
const appShell = fs.readFileSync(path.join(root.pathname,'components/app-shell.tsx'),'utf8');
const sidebar = fs.readFileSync(path.join(root.pathname,'components/sidebar.tsx'),'utf8');
const signOutControl = fs.readFileSync(path.join(root.pathname,'components/sign-out-control.tsx'),'utf8');
const hrefs = [
'/dashboard/complaints','/dashboard/complaints/new','/dashboard/complaints/referrals','/dashboard/complaints/administrative','/dashboard/complaints/human-rights','/dashboard/complaints/police','/dashboard/intake','/dashboard/investigations','/dashboard/investigations/plans','/dashboard/investigations/evidence','/dashboard/investigations/right-to-be-heard','/dashboard/investigations/findings','/dashboard/leadership','/dashboard/leadership/investigations','/dashboard/leadership/referrals','/dashboard/leadership/tribunals','/dashboard/annual-statements','/dashboard/annual-statements/variance-review','/dashboard/government-bodies','/dashboard/oversight','/dashboard/oversight/inspections','/dashboard/oversight/systemic-issues','/dashboard/compliance','/dashboard/compliance/actions','/dashboard/compliance/escalations','/dashboard/commission','/dashboard/commission/decisions','/dashboard/legal','/dashboard/legal/matters','/dashboard/intelligence','/dashboard/intelligence/analysis','/dashboard/reports','/dashboard/tasks','/dashboard/notifications','/dashboard/users','/dashboard/users/roles','/dashboard/audit-log','/dashboard/settings'];
for (const href of hrefs) assert.ok(definitions.includes(`'${href}'`), `missing module definition: ${href}`);
assert.doesNotMatch(definitions.toLowerCase(), /ff3|ff4|budget allocation|expense ledger/);
assert.match(definitions, /LEADERSHIP_RESTRICTED/);
assert.match(definitions, /ANNUAL_STATEMENT_SECRET/);
assert.match(definitions, /INTELLIGENCE_SECRET/);
assert.match(definitions, /LEGAL_PRIVILEGE/);
assert.match(appShell, /SignOutControl/);
assert.match(signOutControl, /Sign out/);
assert.match(signOutControl, /signOutCurrentSession/);
assert.match(dashboardLayout, /resolveAuthorizedNavigation/);
assert.match(dashboardLayout, /has_permission/);
assert.match(dashboardLayout, /has_compartment/);
assert.match(dashboardLayout, /<AppShell navigation=\{navigation\}/);
assert.match(appShell, /<Sidebar navigation=\{navigation\}/);
assert.doesNotMatch(sidebar, /import \{ NAVIGATION \}/);
assert.match(sidebar, /navigation\.map/);
assert.match(routeAuthorization, /isModuleRouteAuthorized/);
assert.match(moduleRoute, /isModuleRouteAuthorized/);
assert.match(moduleRoute, /createServerSupabaseClient/);
assert.match(moduleRoute, /has_permission/);
assert.match(moduleRoute, /has_compartment/);
assert.match(moduleRoute, /if \(!authorized\) notFound\(\)/);
console.log(`WASDOK 360 route smoke checks: PASS (${hrefs.length} configured module surfaces)`);
