import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function assertNoPrivilegedCredentials(text, label, secrets = []) {
  if (secrets.some((secret) => secret && text.includes(secret)) || /sb_secret_[A-Za-z0-9_-]+/.test(text)) {
    throw new Error(`Privileged credential found in ${label}`);
  }
  for (const match of text.matchAll(/eyJ[A-Za-z0-9_-]*\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
    let payload;
    try { payload = JSON.parse(Buffer.from(match[1], 'base64url').toString()); }
    catch { continue; }
    if (payload?.role === 'service_role') throw new Error(`Privileged credential found in ${label}`);
  }
}

export function checkClientArtifacts(buildRoot, secrets = []) {
  const files = [];
  function walk(directory, accept) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file, accept);
      else if (entry.isFile() && accept(file)) files.push(file);
    }
  }
  const staticRoot = path.join(buildRoot, 'static');
  if (!fs.existsSync(staticRoot)) throw new Error('Missing browser build: run the production build first');
  walk(staticRoot, () => true);
  if (!files.some((file) => file.endsWith('.js'))) throw new Error('Empty browser build: no JavaScript assets');
  // Prerendered HTML and RSC payloads are also delivered to browsers. Server JS is not.
  const appRoot = path.join(buildRoot, 'server/app');
  if (fs.existsSync(appRoot)) walk(appRoot, (file) => /\.(html|rsc|txt|body)$/.test(file));
  for (const file of files) {
    assertNoPrivilegedCredentials(fs.readFileSync(file, 'utf8'), path.relative(buildRoot, file), secrets);
  }
  return files.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const count = checkClientArtifacts(path.resolve(process.argv[2] ?? '.next'), [
      process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.SUPABASE_SECRET_KEY,
    ]);
    console.log(`WASDOK-62 browser credential scan: PASS (${count} artifacts)`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
