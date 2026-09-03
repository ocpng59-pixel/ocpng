import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { HEALTH_METRIC_CATALOG } from '@/lib/operations/health/catalog';

const RUNNER_PATH = resolve(process.cwd(), 'scripts/operations/lib/health-collector-runner.mjs');
const CLI_PATH = resolve(process.cwd(), 'scripts/operations/health-collector.mjs');

async function loadRunner() {
  expect(existsSync(RUNNER_PATH), 'Task 7 collector runner must exist').toBe(true);
  return import(pathToFileURL(RUNNER_PATH).href);
}

async function loadCli() {
  expect(existsSync(CLI_PATH), 'Task 7 collector CLI must exist').toBe(true);
  return import(pathToFileURL(CLI_PATH).href);
}

function provider(source: string, collect: () => Promise<unknown>) {
  return { source, provider: { collect } };
}

describe('WASDOK-85 Task 7 collector worker', () => {
  it('keeps the worker allowlist exactly synchronized with the approved metric catalogue', async () => {
    const { HEALTH_COLLECTOR_ALLOWED_METRIC_CODES } = await loadRunner();
    expect(new Set(HEALTH_COLLECTOR_ALLOWED_METRIC_CODES)).toEqual(
      new Set(HEALTH_METRIC_CATALOG.map((definition) => definition.code)),
    );
  });

  it('collects independent providers concurrently, then persists one normalized snapshot per source', async () => {
    const { runHealthCollector } = await loadRunner();
    let started = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolveGate) => { release = resolveGate; });

    const makeCollect = (source: string, code: string, value: number) => async () => {
      started += 1;
      if (started === 2) release();
      await gate;
      return { source: `untrusted-${source}`, status: 'AVAILABLE', metrics: [{ code, value }] };
    };

    const recordSnapshot = vi.fn(async () => 'snapshot-id');
    const result = await runHealthCollector({
      providers: [
        provider('application', makeCollect('application', 'app.availability', 1)),
        provider('database', makeCollect('database', 'db.connections_active', 7)),
      ],
      recordSnapshot,
      now: () => new Date('2026-09-03T01:00:00.000Z'),
      providerTimeoutMs: 1_000,
    });

    expect(started).toBe(2);
    expect(recordSnapshot).toHaveBeenCalledTimes(2);
    expect(recordSnapshot).toHaveBeenNthCalledWith(1, {
      source: 'application',
      observedAt: '2026-09-03T01:00:00.000Z',
      metrics: [{ metric_code: 'app.availability', value: 1 }],
      safeMetadata: { collector: 'WASDOK-85', provider_status: 'AVAILABLE' },
    });
    expect(recordSnapshot).toHaveBeenNthCalledWith(2, {
      source: 'database',
      observedAt: '2026-09-03T01:00:00.000Z',
      metrics: [{ metric_code: 'db.connections_active', value: 7 }],
      safeMetadata: { collector: 'WASDOK-85', provider_status: 'AVAILABLE' },
    });
    expect(result).toEqual({ status: 'COMPLETED', collectedSources: 2, unknownSources: [] });
  });

  it('isolates a thrown provider failure, records that source as UNKNOWN, and never persists the raw error', async () => {
    const { runHealthCollector } = await loadRunner();
    const recordSnapshot = vi.fn(async () => 'snapshot-id');

    const result = await runHealthCollector({
      providers: [
        provider('database', async () => {
          throw new Error('provider failed token=DEMO-SUPER-SECRET raw_payload={protected-case-content}');
        }),
        provider('storage', async () => ({
          source: 'storage', status: 'AVAILABLE', metrics: [{ code: 'storage.object_count', value: 12 }],
        })),
      ],
      recordSnapshot,
      now: () => new Date('2026-09-03T01:05:00.000Z'),
      providerTimeoutMs: 1_000,
    });

    expect(recordSnapshot).toHaveBeenCalledTimes(2);
    expect(recordSnapshot).toHaveBeenNthCalledWith(1, {
      source: 'database',
      observedAt: '2026-09-03T01:05:00.000Z',
      metrics: [],
      safeMetadata: {
        collector: 'WASDOK-85',
        provider_status: 'UNKNOWN',
        reason: 'PROVIDER_ERROR',
      },
    });
    expect(recordSnapshot).toHaveBeenNthCalledWith(2, expect.objectContaining({
      source: 'storage',
      metrics: [{ metric_code: 'storage.object_count', value: 12 }],
    }));
    expect(JSON.stringify(recordSnapshot.mock.calls)).not.toContain('DEMO-SUPER-SECRET');
    expect(JSON.stringify(recordSnapshot.mock.calls)).not.toContain('protected-case-content');
    expect(result).toEqual({
      status: 'COMPLETED_WITH_UNKNOWN',
      collectedSources: 2,
      unknownSources: ['database'],
    });
  });

  it('bounds a stalled provider by timeout without suppressing a healthy provider', async () => {
    const { runHealthCollector } = await loadRunner();
    const recordSnapshot = vi.fn(async () => 'snapshot-id');

    const result = await runHealthCollector({
      providers: [
        provider('security', async () => new Promise(() => undefined)),
        provider('deployment', async () => ({
          source: 'deployment', status: 'AVAILABLE', metrics: [{ code: 'deployment.schema_drift', value: 0 }],
        })),
      ],
      recordSnapshot,
      now: () => new Date('2026-09-03T01:10:00.000Z'),
      providerTimeoutMs: 5,
    });

    expect(recordSnapshot).toHaveBeenCalledTimes(2);
    expect(recordSnapshot).toHaveBeenNthCalledWith(1, expect.objectContaining({
      source: 'security',
      metrics: [],
      safeMetadata: {
        collector: 'WASDOK-85',
        provider_status: 'UNKNOWN',
        reason: 'PROVIDER_UNAVAILABLE',
      },
    }));
    expect(recordSnapshot).toHaveBeenNthCalledWith(2, expect.objectContaining({
      source: 'deployment',
      metrics: [{ metric_code: 'deployment.schema_drift', value: 0 }],
    }));
    expect(result.unknownSources).toEqual(['security']);
  });

  it('drops unknown, non-finite and duplicate metrics before service ingestion and ignores raw provider fields', async () => {
    const { runHealthCollector } = await loadRunner();
    const recordSnapshot = vi.fn(async () => 'snapshot-id');

    await runHealthCollector({
      providers: [provider('database', async () => ({
        source: 'database',
        status: 'AVAILABLE',
        rawPayload: 'DEMO-RAW-PROTECTED-PAYLOAD',
        metrics: [
          { code: 'db.database_bytes', value: 100 },
          { code: 'db.not_allowed', value: 999 },
          { code: 'db.connections_active', value: Number.NaN },
          { code: 'db.database_bytes', value: 200 },
          { code: 'db.deadlocks_24h', value: 0 },
        ],
      }))],
      recordSnapshot,
      now: () => new Date('2026-09-03T01:15:00.000Z'),
    });

    expect(recordSnapshot).toHaveBeenCalledOnce();
    expect(recordSnapshot).toHaveBeenCalledWith({
      source: 'database',
      observedAt: '2026-09-03T01:15:00.000Z',
      metrics: [
        { metric_code: 'db.database_bytes', value: 100 },
        { metric_code: 'db.deadlocks_24h', value: 0 },
      ],
      safeMetadata: { collector: 'WASDOK-85', provider_status: 'AVAILABLE' },
    });
    expect(JSON.stringify(recordSnapshot.mock.calls)).not.toContain('DEMO-RAW-PROTECTED-PAYLOAD');
    expect(JSON.stringify(recordSnapshot.mock.calls)).not.toContain('db.not_allowed');
  });

  it('fails safe to UNKNOWN when a provider claims AVAILABLE but yields no allowlisted metric', async () => {
    const { runHealthCollector } = await loadRunner();
    const recordSnapshot = vi.fn(async () => 'snapshot-id');

    const result = await runHealthCollector({
      providers: [provider('application', async () => ({
        source: 'application', status: 'AVAILABLE', metrics: [{ code: 'app.unapproved', value: 1 }],
      }))],
      recordSnapshot,
      now: () => new Date('2026-09-03T01:20:00.000Z'),
    });

    expect(recordSnapshot).toHaveBeenCalledWith({
      source: 'application',
      observedAt: '2026-09-03T01:20:00.000Z',
      metrics: [],
      safeMetadata: {
        collector: 'WASDOK-85',
        provider_status: 'UNKNOWN',
        reason: 'PROVIDER_ERROR',
      },
    });
    expect(result.status).toBe('COMPLETED_WITH_UNKNOWN');
  });

  it('uses exactly one service-only snapshot write per source so the database remains the single alert-lifecycle authority', async () => {
    const { runHealthCollector } = await loadRunner();
    type RecordedSnapshot = {
      source: string;
      observedAt: string;
      metrics: Array<{ metric_code: string; value: number }>;
      safeMetadata: Record<string, string>;
    };
    const recordedSnapshots: RecordedSnapshot[] = [];
    const recordSnapshot = vi.fn(async (snapshot: RecordedSnapshot) => {
      recordedSnapshots.push(snapshot);
      return 'snapshot-id';
    });
    let value = 250;
    const database = provider('database', async () => ({
      source: 'database', status: 'AVAILABLE', metrics: [{ code: 'db.database_bytes', value }],
    }));

    await runHealthCollector({ providers: [database], recordSnapshot, now: () => new Date('2026-09-03T01:25:00.000Z') });
    value = 50;
    await runHealthCollector({ providers: [database], recordSnapshot, now: () => new Date('2026-09-03T01:30:00.000Z') });

    expect(recordSnapshot).toHaveBeenCalledTimes(2);
    expect(recordedSnapshots[0]?.metrics).toEqual([{ metric_code: 'db.database_bytes', value: 250 }]);
    expect(recordedSnapshots[1]?.metrics).toEqual([{ metric_code: 'db.database_bytes', value: 50 }]);
  });

  it('accepts only the external single-run --once execution contract and contains no internal endless scheduler', async () => {
    const { parseHealthCollectorArguments, executeHealthCollector } = await loadCli();
    expect(parseHealthCollectorArguments(['node', 'health-collector.mjs', '--once'])).toEqual({ mode: 'once' });
    expect(() => parseHealthCollectorArguments(['node', 'health-collector.mjs'])).toThrow(/--once/i);
    expect(() => parseHealthCollectorArguments(['node', 'health-collector.mjs', '--watch'])).toThrow(/--once/i);

    const recordSnapshot = vi.fn(async () => 'snapshot-id');
    const result = await executeHealthCollector({
      argv: ['node', 'health-collector.mjs', '--once'],
      runtimeLoader: async () => ({
        providers: [provider('application', async () => ({
          source: 'application', status: 'AVAILABLE', metrics: [{ code: 'app.availability', value: 1 }],
        }))],
        recordSnapshot,
        now: () => new Date('2026-09-03T01:35:00.000Z'),
      }),
      log: vi.fn(),
    });

    expect(recordSnapshot).toHaveBeenCalledOnce();
    expect(result.status).toBe('COMPLETED');
    const cliSource = readFileSync(CLI_PATH, 'utf8');
    expect(cliSource).not.toMatch(/setInterval\s*\(|while\s*\(\s*true\s*\)/);
  });
});