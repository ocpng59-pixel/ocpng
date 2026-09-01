import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let root: string;
const canary = 'DEMO_SERVER_ONLY_WASDOK62_CANARY';
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'wasdok62-'));
  mkdirSync(join(root, 'static/chunks'), { recursive: true });
  mkdirSync(join(root, 'server/app'), { recursive: true });
  writeFileSync(join(root, 'static/chunks/app.js'), 'console.log("DEMO public app");');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function scan() {
  return spawnSync(process.execPath, [resolve('scripts/check-client-artifacts.mjs'), root], {
    encoding: 'utf8', env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: canary },
  });
}

describe('WASDOK-62 built browser credential scanner', () => {
  it('accepts clean browser assets without treating SDK role names as credentials', () => {
    writeFileSync(join(root, 'static/chunks/sdk.js'), 'const role = "service_role"; const key = "sb_publishable_DEMO";');
    expect(scan().status).toBe(0);
  });

  it.each(['static/chunks/app.js', 'static/chunks/app.js.map', 'server/app/login.html', 'server/app/index.rsc'])
    ('rejects server canary leakage into %s without printing its value', (file) => {
      writeFileSync(join(root, file), `const leaked = "${canary}";`);
      const result = scan();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('credential');
      expect(result.stderr).not.toContain(canary);
    });

  it('rejects a service-role JWT even when it differs from the configured canary', () => {
    const token = [
      Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url'),
      Buffer.from(JSON.stringify({ role: 'service_role', ref: 'DEMO' })).toString('base64url'),
      'DEMO-signature',
    ].join('.');
    writeFileSync(join(root, 'static/chunks/app.js'), `const leaked = "${token}";`);
    const result = scan();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('credential');
    expect(result.stderr).not.toContain(token);
  });

  it('rejects a Supabase secret key', () => {
    writeFileSync(join(root, 'static/chunks/app.js'), 'const leaked = "sb_secret_DEMO_privileged_value";');
    const result = scan();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('credential');
  });

  it('fails if no browser build exists', () => {
    rmSync(join(root, 'static'), { recursive: true });
    const result = scan();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Missing browser build');
  });

  it('fails if the build directory contains no JavaScript to inspect', () => {
    rmSync(join(root, 'static/chunks/app.js'));
    const result = scan();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Empty browser build');
  });
});
