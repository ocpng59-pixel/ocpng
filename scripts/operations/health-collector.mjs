#!/usr/bin/env node

import { runHealthCollector } from './lib/health-collector-runner.mjs';

export function parseHealthCollectorArguments() {
  throw new Error('Usage: health-collector.mjs --once');
}

export async function executeHealthCollector() {
  return runHealthCollector();
}
