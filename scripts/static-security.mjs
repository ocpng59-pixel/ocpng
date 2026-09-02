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

console.log(`WASDOK 360 static security scan: PASS (${files.length} source/config files; ${backupBrowserFiles.length} WASDOK-55 browser files)`);
