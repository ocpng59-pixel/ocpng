#!/usr/bin/env node

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runHealthCollector } from './lib/health-collector-runner.mjs';
import { safeOperationalError } from './lib/redaction.mjs';

export function parseHealthCollectorArguments(argv = process.argv) {
  const args = argv.slice(2);
  if (args.length === 1 && args[0] === '--once') {
    return { mode: 'once' };
  }
  throw new Error('Usage: health-collector.mjs --once');
}

async function loadRuntime() {
  const modulePath = String(process.env.OCPNG_HEALTH_COLLECTOR_RUNTIME_MODULE ?? '').trim();
  if (!modulePath) {
    throw new Error('Health collector runtime adapter is not configured.');
  }

  const specifier = modulePath.startsWith('file:')
    ? modulePath
    : pathToFileURL(modulePath).href;
  const runtimeModule = await import(specifier);
  if (typeof runtimeModule.createHealthCollectorRuntime !== 'function') {
    throw new Error('Health collector runtime adapter is invalid.');
  }
  return runtimeModule.createHealthCollectorRuntime();
}

export async function executeHealthCollector({
  argv = process.argv,
  runtimeLoader = loadRuntime,
  log = console.log,
} = {}) {
  parseHealthCollectorArguments(argv);
  const runtime = await runtimeLoader();
  const result = await runHealthCollector({
    providers: runtime?.providers,
    recordSnapshot: runtime?.recordSnapshot,
    now: runtime?.now,
    providerTimeoutMs: runtime?.providerTimeoutMs,
  });

  if (typeof log === 'function') {
    log(`WASDOK-85 health collector ${result.status}: ${result.collectedSources} source(s), ${result.unknownSources.length} UNKNOWN.`);
  }
  return result;
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  executeHealthCollector().catch((error) => {
    console.error(`WASDOK-85 health collector failed: ${safeOperationalError(error)}`);
    process.exitCode = 1;
  });
}
