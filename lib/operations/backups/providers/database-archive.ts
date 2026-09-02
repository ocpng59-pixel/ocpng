import { spawn } from 'node:child_process';
import { chmod, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { DatabaseArchiveProvider } from '../provider-types';
import type { DatabaseArchiveResult } from '../types';

export type DatabaseDumpCommand = {
  command: 'sh';
  args: string[];
  env: Record<string, string | undefined>;
  outputPath: string;
};

type DatabaseDumpCommandRunner = (command: DatabaseDumpCommand) => Promise<void>;

type SupabaseCliDatabaseArchiveProviderOptions = {
  databaseUrl: string;
  runCommand?: DatabaseDumpCommandRunner;
};

function quoteShell(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

async function runCommand(command: DatabaseDumpCommand): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      env: { ...process.env, ...command.env },
      stdio: 'ignore',
    });
    child.once('error', () => reject(new Error('Database archive command could not be started.')));
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error('Database archive command failed.'));
    });
  });
}

export class SupabaseCliDatabaseArchiveProvider implements DatabaseArchiveProvider {
  private readonly databaseUrl: string;
  private readonly runCommand: DatabaseDumpCommandRunner;

  constructor(options: SupabaseCliDatabaseArchiveProviderOptions) {
    this.databaseUrl = options.databaseUrl;
    this.runCommand = options.runCommand ?? runCommand;
  }

  async createLogicalExport(workDir: string): Promise<DatabaseArchiveResult> {
    await mkdir(workDir, { recursive: true, mode: 0o700 });

    const steps = [
      {
        fileName: 'roles.sql',
        flags: '--role-only',
      },
      {
        fileName: 'schema.sql',
        flags: '',
      },
      {
        fileName: 'data.sql',
        flags: '--use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"',
      },
      {
        fileName: 'migration_history_schema.sql',
        flags: '--schema supabase_migrations',
      },
      {
        fileName: 'migration_history_data.sql',
        flags: '--use-copy --data-only --schema supabase_migrations',
      },
    ];

    const files: string[] = [];
    for (const step of steps) {
      const outputPath = join(workDir, step.fileName);
      const script = [
        'supabase db dump',
        '--db-url "$OCPNG_BACKUP_DATABASE_URL"',
        `-f ${quoteShell(outputPath)}`,
        step.flags,
      ].filter(Boolean).join(' ');

      await this.runCommand({
        command: 'sh',
        args: ['-eu', '-c', script],
        env: { OCPNG_BACKUP_DATABASE_URL: this.databaseUrl },
        outputPath,
      });
      await chmod(outputPath, 0o600);
      files.push(outputPath);
    }

    let byteSize = 0;
    for (const file of files) byteSize += (await stat(file)).size;

    return {
      files,
      byteSize,
      safeMetadata: {
        provider: 'supabase_cli',
        fileCount: files.length,
        migrationHistoryIncluded: true,
      },
    };
  }
}
