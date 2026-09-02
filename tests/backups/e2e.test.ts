import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { SupabaseArchiveStore } from '@/lib/operations/backups/providers/archive-store';
import { runBackupJob } from '../../scripts/operations/lib/backup-job-runner.mjs';

const describeE2E = process.env.WASDOK55_BACKUP_E2E === 'true'
  ? describe.sequential
  : describe.skip;

const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const demoPassword = 'DEMO-WASDOK55-Local-Only!';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`WASDOK-55 local Supabase environment is unavailable: ${name}.`);
  return value;
}

function serviceClient(): SupabaseClient {
  return createClient(requiredEnv('NEXT_PUBLIC_SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function anonymousClient(): SupabaseClient {
  return createClient(requiredEnv('NEXT_PUBLIC_SUPABASE_URL'), requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function createDemoUser(service: SupabaseClient, label: string) {
  const email = `wasdok55-${label.toLowerCase()}-${suffix}@example.com`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: demoPassword,
    email_confirm: true,
    user_metadata: { display_name: `DEMO WASDOK55 ${label}` },
  });
  expect(error).toBeNull();
  const client = anonymousClient();
  const signIn = await client.auth.signInWithPassword({ email, password: demoPassword });
  expect(signIn.error).toBeNull();
  return { id: data.user!.id, email, client };
}

async function grantPermissions(
  service: SupabaseClient,
  userId: string,
  roleCode: string,
  permissionCodes: string[],
) {
  const { data: role, error: roleError } = await service.from('roles').insert({
    code: roleCode,
    name: `DEMO WASDOK55 ${roleCode}`,
    description: 'Local-only WASDOK-55 end-to-end role.',
    role_type: 'administrative',
    classification: 'RESTRICTED',
    metadata: { demo: true, wasdok: 'WASDOK-55' },
  }).select('id').single();
  expect(roleError).toBeNull();

  const { data: permissions, error: permissionError } = await service
    .from('permissions').select('id,code').in('code', permissionCodes);
  expect(permissionError).toBeNull();
  expect(permissions).toHaveLength(permissionCodes.length);

  const rolePermissions = await service.from('role_permissions').insert(
    permissions!.map((permission) => ({
      role_id: role!.id,
      permission_id: permission.id,
      is_active: true,
      metadata: { demo: true, wasdok: 'WASDOK-55' },
    })),
  );
  expect(rolePermissions.error).toBeNull();
  const assignment = await service.from('user_roles').insert({
    user_id: userId,
    role_id: role!.id,
    is_active: true,
    metadata: { demo: true, wasdok: 'WASDOK-55' },
  });
  expect(assignment.error).toBeNull();
}

describe('WASDOK-55 Task 10 release wiring contract', () => {
  it('runs the local-only Backup & Recovery E2E in CI', () => {
    const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
    expect(workflow).toContain('Backup & Recovery end-to-end (WASDOK-55)');
    expect(workflow).toContain('WASDOK55_BACKUP_E2E="true"');
    expect(workflow).toContain('tests/backups/e2e.test.ts');
    expect(workflow).not.toContain('OCPNG_SUPABASE_MANAGEMENT_TOKEN');
  });

  it('ships deployment and isolated restore-rehearsal runbooks', () => {
    for (const path of [
      'docs/deployment/WASDOK-55-BACKUP-RECOVERY-DEPLOYMENT.md',
      'docs/operations/WASDOK-55-RESTORE-REHEARSAL.md',
    ]) expect(existsSync(path), `missing ${path}`).toBe(true);
  });

  it('extends route/static security checks for Backup & Recovery', () => {
    const routes = readFileSync('scripts/routes-smoke.mjs', 'utf8');
    const security = readFileSync('scripts/static-security.mjs', 'utf8');
    expect(routes).toContain('/dashboard/operations/backups');
    expect(routes).toContain('app/dashboard/operations/backups/restore/page.tsx');
    for (const token of [
      'OCPNG_SUPABASE_MANAGEMENT_TOKEN',
      'OCPNG_BACKUP_DATABASE_URL',
      'OCPNG_BACKUP_KEY_REF',
      'createServiceSupabaseClient',
    ]) expect(security).toContain(token);
    expect(security).toMatch(/signed.?url/i);
  });
});

describeE2E('WASDOK-55 Backup & Recovery end-to-end', () => {
  let service: SupabaseClient;
  let operator: Awaited<ReturnType<typeof createDemoUser>>;
  let authorizer: Awaited<ReturnType<typeof createDemoUser>>;
  let outsider: Awaited<ReturnType<typeof createDemoUser>>;
  let availableBackupId: string;

  beforeAll(async () => {
    service = serviceClient();
    operator = await createDemoUser(service, 'Operator');
    authorizer = await createDemoUser(service, 'Authorizer');
    outsider = await createDemoUser(service, 'Outsider');

    await grantPermissions(service, operator.id, `wasdok55_operator_${suffix}`, [
      'backup.view', 'backup.create', 'backup.download', 'backup.schedule',
      'backup.restore_test', 'backup.restore_production', 'backup.manage_retention',
    ]);
    await grantPermissions(service, authorizer.id, `wasdok55_authorizer_${suffix}`, [
      'backup.view', 'backup.authorize_production_restore',
    ]);
  });

  it('executes request -> trusted worker -> verified AVAILABLE archive with safe audit evidence', async () => {
    const requested = await operator.client.rpc('request_backup', {
      p_backup_type: 'FULL_ARCHIVE',
      p_reason: 'DEMO WASDOK55 full archive lifecycle',
    });
    expect(requested.error).toBeNull();
    availableBackupId = requested.data as string;

    const queued = await service.rpc('record_backup_worker_transition', {
      p_backup_id: availableBackupId,
      p_from: 'REQUESTED',
      p_to: 'QUEUED',
      p_safe_metadata: { demo: true, wasdok: 'WASDOK-55' },
    });
    expect(queued.error).toBeNull();

    let cleanupCalled = false;
    const result = await runBackupJob({
      jobId: availableBackupId,
      loadJob: async (jobId: string) => {
        const row = await service.from('backup_jobs').select('id,status,backup_type').eq('id', jobId).single();
        expect(row.error).toBeNull();
        return row.data;
      },
      transition: async (jobId: string, from: string, to: string, safeMetadata = {}) => {
        const transition = await service.rpc('record_backup_worker_transition', {
          p_backup_id: jobId, p_from: from, p_to: to,
          p_safe_metadata: { ...safeMetadata, demo: true, wasdok: 'WASDOK-55' },
        });
        if (transition.error) throw transition.error;
      },
      exportDatabase: async () => ({ byteSize: 512, files: ['roles.sql', 'schema.sql', 'data.sql', 'migration-history.sql'] }),
      verifyIdentity: async () => ({ covered: true, method: 'DEMO provider-native identity recovery' }),
      exportStorage: async () => ({ byteSize: 1024, objectCount: 2, objects: ['DEMO/object-a', 'DEMO/object-b'] }),
      packageArchive: async () => ({
        filePath: '/tmp/DEMO-WASDOK55-FULL.zip.enc',
        byteSize: 1536,
        checksumSha256: 'a'.repeat(64),
        keyRef: 'DEMO-WASDOK55-KEY-REF',
      }),
      verifyArchive: async () => true,
      storeArchive: async (artifact: { byteSize: number; checksumSha256: string }) => {
        const inserted = await service.from('backup_artifacts').insert({
          backup_id: availableBackupId,
          artifact_type: 'ENCRYPTED_FULL_ARCHIVE',
          storage_reference: `DEMO-WASDOK55/${availableBackupId}.zip.enc`,
          byte_size: artifact.byteSize,
          archive_checksum: artifact.checksumSha256,
          encryption_algorithm: 'AES-256-GCM',
          encryption_key_reference: 'DEMO-WASDOK55-KEY-REF',
          recovery_domains: { application_database: true, identity: true, storage_objects: true },
          safe_metadata: { demo: true, wasdok: 'WASDOK-55' },
        });
        expect(inserted.error).toBeNull();
        return { ref: `DEMO-WASDOK55/${availableBackupId}.zip.enc`, byteSize: artifact.byteSize, checksumSha256: artifact.checksumSha256 };
      },
      recordVerification: async (jobId: string, status: string, safeMetadata: Record<string, unknown>) => {
        const verification = await service.rpc('record_backup_verification', {
          p_backup_id: jobId,
          p_status: status,
          p_safe_metadata: { ...safeMetadata, demo: true, wasdok: 'WASDOK-55' },
        });
        if (verification.error) throw verification.error;
      },
      cleanup: async () => { cleanupCalled = true; },
      log: () => undefined,
    });

    expect(result.status).toBe('AVAILABLE');
    expect(cleanupCalled).toBe(true);
    const job = await service.from('backup_jobs').select('status,verified_at').eq('id', availableBackupId).single();
    expect(job.error).toBeNull();
    expect(job.data?.status).toBe('AVAILABLE');
    expect(job.data?.verified_at).toBeTruthy();
    const verification = await service.from('backup_verifications').select('status').eq('backup_id', availableBackupId).single();
    expect(verification.data?.status).toBe('PASSED');

    const audit = await service.from('audit_events')
      .select('action,request_metadata,before_data,after_data,reason,metadata')
      .in('action', ['backup.requested', 'backup.status_changed', 'backup.verified'])
      .order('created_at');
    expect(audit.error).toBeNull();
    const serialized = JSON.stringify(audit.data ?? []);
    expect(serialized).toContain('WASDOK-55');
    expect(serialized).not.toContain(demoPassword);
    expect(serialized.toLowerCase()).not.toMatch(/access_token|refresh_token|service_role|database_url|encryption_key|signed_url|bearer\s/);
  });

  it('denies unauthorized download and generates only a short-lived signed grant after authorization', async () => {
    const denied = await outsider.client.rpc('request_backup_download', {
      p_backup_id: availableBackupId,
      p_reason: 'DEMO WASDOK55 unauthorized download attempt',
    });
    expect(denied.error?.code).toBe('42501');

    const allowed = await operator.client.rpc('request_backup_download', {
      p_backup_id: availableBackupId,
      p_reason: 'DEMO WASDOK55 authorized download request',
    });
    expect(allowed.error).toBeNull();

    let requestedExpiry = 0;
    const store = new SupabaseArchiveStore({
      bucket: 'demo-wasdok55-private',
      client: {
        storage: {
          from: () => ({
            upload: async () => ({ data: { path: 'unused' }, error: null }),
            createSignedUrl: async (_path: string, expiresIn: number) => {
              requestedExpiry = expiresIn;
              return { data: { signedUrl: 'https://example.invalid/DEMO-WASDOK55-SIGNED' }, error: null };
            },
          }),
        },
      },
    });
    const grant = await store.createDownloadGrant(`DEMO-WASDOK55/${availableBackupId}.zip.enc`, 300);
    expect(grant).toContain('DEMO-WASDOK55-SIGNED');
    expect(requestedExpiry).toBe(300);
    await expect(store.createDownloadGrant('DEMO-WASDOK55/archive.zip.enc', 901)).rejects.toThrow();
  });

  it('enforces schedule/retention authorization and creates restore rehearsal requests', async () => {
    const deniedPolicy = await outsider.client.rpc('admin_upsert_retention_policy', {
      p_policy_id: null, p_name: `DEMO WASDOK55 ${suffix}`, p_retention_days: 30,
      p_purge_enabled: false, p_reason: 'DEMO WASDOK55 outsider policy',
    });
    expect(deniedPolicy.error?.code).toBe('42501');

    const policy = await operator.client.rpc('admin_upsert_retention_policy', {
      p_policy_id: null, p_name: `DEMO WASDOK55 Retention ${suffix}`, p_retention_days: 30,
      p_purge_enabled: false, p_reason: 'DEMO WASDOK55 retention setup',
    });
    expect(policy.error).toBeNull();

    const schedule = await operator.client.rpc('admin_upsert_backup_schedule', {
      p_schedule_id: null, p_backup_type: 'FULL_ARCHIVE', p_cadence: '0 1 * * 0',
      p_retention_policy_id: policy.data, p_enabled: true, p_reason: 'DEMO WASDOK55 schedule setup',
    });
    expect(schedule.error).toBeNull();

    const rehearsal = await operator.client.rpc('request_restore_test', {
      p_backup_id: availableBackupId,
      p_reason: 'DEMO WASDOK55 isolated restore rehearsal',
    });
    expect(rehearsal.error).toBeNull();
    const restore = await service.from('restore_runs').select('restore_type,status').eq('id', rehearsal.data).single();
    expect(restore.data).toMatchObject({ restore_type: 'TEST', status: 'REQUESTED' });
  });

  it('requires a different authorized officer for production restore', async () => {
    const recoveryTime = new Date(Date.now() - 60_000).toISOString();
    const recoveryRef = `DEMO-WASDOK55-PITR-${suffix}`;
    const point = await service.from('provider_recovery_points').insert({
      provider: 'DEMO_LOCAL_PROVIDER',
      recovery_reference: recoveryRef,
      recovery_kind: 'PITR',
      recovery_time: recoveryTime,
      earliest_recovery_time: new Date(Date.now() - 3_600_000).toISOString(),
      latest_recovery_time: new Date().toISOString(),
      available: true,
      safe_metadata: { demo: true, wasdok: 'WASDOK-55' },
    });
    expect(point.error).toBeNull();

    const request = await operator.client.rpc('request_production_restore', {
      p_recovery_ref: recoveryRef,
      p_recovery_time: recoveryTime,
      p_reason: 'DEMO WASDOK55 production restore request',
    });
    expect(request.error).toBeNull();
    const restoreId = request.data as string;

    for (const [from, to] of [['REQUESTED', 'IMPACT_REVIEW'], ['IMPACT_REVIEW', 'AWAITING_AUTHORIZATION']] as const) {
      const transition = await service.rpc('record_restore_worker_transition', {
        p_restore_id: restoreId, p_from: from, p_to: to,
        p_safe_metadata: { demo: true, wasdok: 'WASDOK-55' },
      });
      expect(transition.error).toBeNull();
    }

    const selfAuthorize = await operator.client.rpc('authorize_production_restore', {
      p_restore_id: restoreId,
      p_reason: 'DEMO WASDOK55 self authorization must fail',
    });
    expect(selfAuthorize.error?.code).toBe('42501');

    const authorized = await authorizer.client.rpc('authorize_production_restore', {
      p_restore_id: restoreId,
      p_reason: 'DEMO WASDOK55 independent authorization',
    });
    expect(authorized.error).toBeNull();
    const final = await service.from('restore_runs').select('status').eq('id', restoreId).single();
    expect(final.data?.status).toBe('AUTHORIZED');
  });

  it('fails closed on provider failure and redacts secrets from operational logs', async () => {
    const requested = await operator.client.rpc('request_backup', {
      p_backup_type: 'FULL_ARCHIVE',
      p_reason: 'DEMO WASDOK55 provider failure path',
    });
    expect(requested.error).toBeNull();
    const jobId = requested.data as string;
    expect((await service.rpc('record_backup_worker_transition', {
      p_backup_id: jobId, p_from: 'REQUESTED', p_to: 'QUEUED',
      p_safe_metadata: { demo: true, wasdok: 'WASDOK-55' },
    })).error).toBeNull();

    const logs: string[] = [];
    await expect(runBackupJob({
      jobId,
      loadJob: async () => ({ id: jobId, status: 'QUEUED', backup_type: 'FULL_ARCHIVE' }),
      transition: async (id: string, from: string, to: string, safeMetadata = {}) => {
        const result = await service.rpc('record_backup_worker_transition', {
          p_backup_id: id, p_from: from, p_to: to,
          p_safe_metadata: { ...safeMetadata, demo: true, wasdok: 'WASDOK-55' },
        });
        if (result.error) throw result.error;
      },
      exportDatabase: async () => { throw new Error('provider failed token=DEMO-WASDOK55-SECRET'); },
      verifyIdentity: async () => ({ covered: true }),
      exportStorage: async () => ({ byteSize: 0, objectCount: 0 }),
      packageArchive: async () => ({}),
      verifyArchive: async () => true,
      storeArchive: async () => ({}),
      recordVerification: async () => undefined,
      cleanup: async () => undefined,
      log: (message: string) => logs.push(message),
    })).rejects.toThrow('Backup job failed.');

    const failed = await service.from('backup_jobs').select('status').eq('id', jobId).single();
    expect(failed.data?.status).toBe('FAILED');
    expect(logs.join('\n')).not.toContain('DEMO-WASDOK55-SECRET');
    expect(logs.join('\n')).toContain('[REDACTED]');
  });
});
