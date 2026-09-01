import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { assertNoPrivilegedCredentials, checkClientArtifacts } from './check-client-artifacts.mjs';

// These values are deliberately synthetic. This job never uses a hosted project.
const serviceCanary = 'DEMO_WASDOK62_SERVER_SERVICE_ROLE_CANARY';
const secretCanary = 'sb_secret_DEMO_WASDOK62_SERVER_SECRET_CANARY';
const env = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: '1',
  NEXT_PUBLIC_APP_ENV: 'test',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:1',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_DEMO_WASDOK62_PUBLIC',
  OCPNG_STRICT_ENV: 'true',
  SUPABASE_SERVICE_ROLE_KEY: serviceCanary,
  SUPABASE_SECRET_KEY: secretCanary,
};
const secrets = [serviceCanary, secretCanary];

async function runBuild() {
  const build = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
    env, stdio: 'inherit',
  });
  const [code] = await once(build, 'exit');
  assert.equal(code, 0, 'Production build failed');
}

async function freePort() {
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function smokeRequests() {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    env, stdio: 'inherit',
  });
  const serverExited = once(server, 'exit');
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error('Production server exited before readiness');
      try {
        const response = await fetch(`${origin}/login`, { signal: AbortSignal.timeout(1000) });
        if (response.status === 200) { ready = true; break; }
      } catch { /* Retry until the server is ready, with a bounded deadline. */ }
      await delay(200);
    }
    assert.ok(ready, 'Production server readiness timed out');
    for (const route of ['/login', '/forgot-password', '/set-password']) {
      const response = await fetch(`${origin}${route}`, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, 200, `Public route unavailable: ${route}`);
      assertNoPrivilegedCredentials(await response.text(), route, secrets);
    }
    let count = 0;
    for (const route of ['/dashboard', '/dashboard/complaints', '/dashboard/investigations/DEMO-62', '/dashboard/annual-statements', '/dashboard/legal']) {
      for (const headers of [{}, { RSC: '1' }, { Cookie: 'sb-127-auth-token=DEMO-invalid-session' }]) {
        for (const method of ['GET', 'HEAD']) {
          const response = await fetch(`${origin}${route}?private=DEMO-sensitive`, {
            method, headers, redirect: 'manual', signal: AbortSignal.timeout(5000),
          });
          assert.equal(response.status, 307, `${method} ${route} must redirect`);
          assert.equal(new URL(response.headers.get('location'), origin).href, `${origin}/login`);
          const body = await response.text();
          assert.ok(!body.includes('DEMO-sensitive'), 'Protected query reflected in response');
          assertNoPrivilegedCredentials(body, `${method} ${route}`, secrets);
          count++;
        }
      }
    }
    console.log(`WASDOK-62 production HTTP boundary: PASS (${count} protected requests, 3 public routes)`);
  } finally {
    if (server.exitCode === null) {
      server.kill('SIGTERM');
      const forceKill = setTimeout(() => server.kill('SIGKILL'), 5000);
      forceKill.unref();
      await serverExited;
      clearTimeout(forceKill);
    }
  }
}

await runBuild();
console.log(`WASDOK-62 browser credential scan: PASS (${checkClientArtifacts('.next', secrets)} artifacts)`);
await smokeRequests();
