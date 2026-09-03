import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('../', import.meta.url).pathname);
const ignored = new Set(['node_modules','.next','.git','coverage']);
const productionExtensions = new Set(['.ts','.tsx','.js','.mjs','.sql','.json','.toml','.md']);
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    if (ignored.has(entry.name)) continue;
    const full=path.join(dir,entry.name);
    if (entry.isDirectory()) walk(full); else if (productionExtensions.has(path.extname(entry.name))) files.push(full);
  }
}
walk(root);
const all = files.map((f)=>`${path.relative(root,f)}\n${fs.readFileSync(f,'utf8')}`).join('\n');
assert.doesNotMatch(all, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, 'JWT-like credential found');
const envExample=fs.readFileSync(path.join(root,'.env.example'),'utf8');
for (const line of envExample.split(/\r?\n/)) {
  if (/KEY=|URL=/.test(line)) assert.ok(!line.split('=').slice(1).join('=').trim(), `.env.example must contain blank placeholders: ${line}`);
}
const productionRoots = ['app','components','contexts','lib','supabase'];
const prodOnly = files.filter((f)=>productionRoots.includes(path.relative(root,f).split(path.sep)[0])).map((f)=>fs.readFileSync(f,'utf8')).join('\n').toLowerCase();
assert.doesNotMatch(prodOnly, /\bff3\b|\bff4\b|expense_ledger|budget_allocations|supplier_registry/, 'NJSS/finance-domain residue found in OCPNG production source');
assert.doesNotMatch(prodOnly, /supabase_service_role_key\s*=\s*['\"][^'\"]+['\"]/, 'hard-coded service role value found');

const backupBrowserFiles = files.filter((f) => {
  const rel = path.relative(root, f).replaceAll(path.sep, '/');
  return rel.startsWith('components/operations/backups/') ||
    rel === 'app/dashboard/operations/backups/page.tsx' ||
    rel === 'app/dashboard/operations/backups/[backupId]/page.tsx' ||
    rel === 'app/dashboard/operations/backups/restore/page.tsx';
});
const backupBrowserSurface = backupBrowserFiles.map((f)=>fs.readFileSync(f,'utf8')).join('\n');
const backupForbidden = [
  'OCPNG_SUPABASE_MANAGEMENT_TOKEN',
  'OCPNG_BACKUP_DATABASE_URL',
  'OCPNG_BACKUP_KEY_REF',
  'SUPABASE_SERVICE_ROLE_KEY',
  'createServiceSupabaseClient',
];
for (const token of backupForbidden) {
  assert.ok(!backupBrowserSurface.includes(token), `WASDOK-55 browser surface must not contain ${token}`);
}
const signedUrlPersistencePattern = /(?:insert|update|upsert)[\s\S]{0,200}signed.?url/i;
assert.doesNotMatch(backupBrowserSurface, signedUrlPersistencePattern, 'WASDOK-55 browser surface must never persist a signed URL');
assert.doesNotMatch(backupBrowserSurface, /NEXT_PUBLIC_(?:OCPNG_)?(?:SUPABASE_MANAGEMENT|BACKUP_DATABASE|BACKUP_KEY|BACKUP_BUCKET)/, 'WASDOK-55 operations credentials must never be public environment values');

const healthBrowserFiles = files.filter((f) => {
  const rel = path.relative(root, f).replaceAll(path.sep, '/');
  return rel.startsWith('components/operations/health/') ||
    rel.startsWith('app/dashboard/operations/system-health/');
});
const healthBrowserSurface = healthBrowserFiles.map((f)=>fs.readFileSync(f,'utf8')).join('\n');
const healthForbidden = [
  'OCPNG_SUPABASE_HEALTH_TOKEN',
  'OCPNG_SUPABASE_PROJECT_REF',
  'OCPNG_HEALTH_COLLECTOR_RUNTIME_MODULE',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OCPNG_BACKUP_DATABASE_URL',
  'createServiceSupabaseClient',
  'raw_payload',
  'object_name',
  'object_path',
  'storage_reference',
];
for (const token of healthForbidden) {
  assert.ok(!healthBrowserSurface.includes(token), `WASDOK-85 browser surface must not contain ${token}`);
}
assert.doesNotMatch(healthBrowserSurface, /NEXT_PUBLIC_(?:OCPNG_)?(?:SUPABASE_HEALTH|SUPABASE_PROJECT_REF|SUPABASE_MANAGEMENT|BACKUP_DATABASE|HEALTH_COLLECTOR_RUNTIME_MODULE)/, 'WASDOK-85 privileged health/provider configuration must never be public environment data');
assert.doesNotMatch(healthBrowserSurface, /analytics\/endpoints\/metrics|api\.supabase\.com\/v1\/projects/i, 'WASDOK-85 browser surface must never scrape provider metrics endpoints');
assert.doesNotMatch(healthBrowserSurface, /\b(?:filename|object_name|object_path|storage_reference)\b/i, 'WASDOK-85 browser surface must not expose protected Storage object identifiers');

const requiredHealthRuntimeEnv = [
  'OCPNG_SUPABASE_PROJECT_REF',
  'OCPNG_SUPABASE_HEALTH_TOKEN',
  'OCPNG_PUBLIC_APP_URL',
  'OCPNG_DEPLOYED_COMMIT',
  'OCPNG_RELEASE_ID',
  'OCPNG_HEALTH_COLLECTOR_RUNTIME_MODULE',
];
for (const variable of requiredHealthRuntimeEnv) {
  assert.match(envExample, new RegExp(`^${variable}=$`, 'm'), `WASDOK-85 .env.example must contain blank ${variable}`);
  assert.ok(!envExample.includes(`NEXT_PUBLIC_${variable}`), `WASDOK-85 ${variable} must never be public`);
}

const healthRuntimePaths = [
  'scripts/operations/runtime/health-production-runtime.mjs',
  'scripts/operations/lib/health-runtime-config.mjs',
  'scripts/operations/lib/health-supabase-runtime.mjs',
  'scripts/operations/lib/providers/application-health.mjs',
  'scripts/operations/lib/providers/supabase-metrics.mjs',
  'scripts/operations/lib/providers/backup-health.mjs',
  'scripts/operations/lib/providers/schema-drift.mjs',
  'scripts/operations/lib/providers/security-health.mjs',
];
const healthRuntimeSurface = healthRuntimePaths
  .map((relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8'))
  .join('\n');
assert.doesNotMatch(
  healthRuntimeSurface,
  /(?:sbp_|sb_secret_)[A-Za-z0-9_-]{20,}/,
  'WASDOK-85 runtime must not contain hard-coded provider/service credentials',
);
assert.ok(
  !healthRuntimeSurface.includes('supabase_migrations.schema_migrations'),
  'WASDOK-85 runtime must never read raw Supabase migration ledger',
);

const healthSupabaseRuntime = fs.readFileSync(
  path.join(root,'scripts/operations/lib/health-supabase-runtime.mjs'),
  'utf8',
);
assert.doesNotMatch(
  healthSupabaseRuntime,
  /\.from\(['"](?:system_health_[^'"]*|deployment_health_state|health_metric_catalog)['"]\)/,
  'WASDOK-85 runtime health persistence must use RPCs, not direct health table access',
);
const allowedHealthRuntimeRpcs = [
  'read_applied_schema_version',
  'record_deployment_health_state',
  'record_health_snapshot',
].sort();
const healthRuntimeRpcNames = Array.from(
  healthSupabaseRuntime.matchAll(/\.rpc\(['"]([^'"]+)['"]/g),
  (match)=>match[1],
).sort();
assert.deepEqual(
  healthRuntimeRpcNames,
  allowedHealthRuntimeRpcs,
  'WASDOK-85 runtime may invoke only the reviewed health RPC allowlist',
);
const healthBackupForbidden = [
  'backup_artifacts',
  'storage_reference',
  'archive_checksum',
  'encryption_key_reference',
  'provider_recovery_ref',
  'impact_summary',
];
for (const field of healthBackupForbidden) {
  assert.ok(!healthSupabaseRuntime.includes(field), `WASDOK-85 runtime must not read protected backup field ${field}`);
}
assert.doesNotMatch(
  healthSupabaseRuntime,
  /\.select\([^)]*safe_metadata/i,
  'WASDOK-85 runtime must not read arbitrary backup safe_metadata',
);

console.log(`WASDOK 360 static security scan: PASS (${files.length} source/config files; ${backupBrowserFiles.length} WASDOK-55 browser files; ${healthBrowserFiles.length} WASDOK-85 browser files; ${healthRuntimePaths.length} WASDOK-85 runtime files)`);
