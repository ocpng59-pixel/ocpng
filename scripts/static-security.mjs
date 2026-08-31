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
console.log(`WASDOK 360 static security scan: PASS (${files.length} source/config files)`);
