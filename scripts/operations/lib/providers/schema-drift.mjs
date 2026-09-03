export const EXPECTED_SCHEMA_VERSION = '20260903002400';

function isSchemaVersion(value) {
  return /^\d{14}$/.test(value);
}

export class SchemaDriftProvider {
  constructor(input) {
    this.loadAppliedSchemaVersion = input.loadAppliedSchemaVersion;
    this.environment = input.environment;
    this.deployedCommit = input.deployedCommit;
    this.releaseId = input.releaseId;
    this.now = input.now ?? (() => new Date());
  }

  async readState() {
    const observedAt = this.now().toISOString();

    try {
      const appliedSchemaVersion = await this.loadAppliedSchemaVersion();
      if (!isSchemaVersion(appliedSchemaVersion)) throw new Error('INVALID_SCHEMA_VERSION');

      const drifted = appliedSchemaVersion !== EXPECTED_SCHEMA_VERSION;
      return {
        environment: this.environment,
        ...(this.deployedCommit ? { deployedCommit: this.deployedCommit } : {}),
        ...(this.releaseId ? { releaseId: this.releaseId } : {}),
        expectedSchemaVersion: EXPECTED_SCHEMA_VERSION,
        appliedSchemaVersion,
        status: drifted ? 'CRITICAL' : 'HEALTHY',
        source: 'deployment',
        provider: 'wasdok',
        observedAt,
      };
    } catch {
      return {
        environment: this.environment,
        ...(this.deployedCommit ? { deployedCommit: this.deployedCommit } : {}),
        ...(this.releaseId ? { releaseId: this.releaseId } : {}),
        expectedSchemaVersion: EXPECTED_SCHEMA_VERSION,
        status: 'UNKNOWN',
        source: 'deployment',
        provider: 'wasdok',
        observedAt,
      };
    }
  }

  async collect() {
    const state = await this.readState();
    if (state.status === 'UNKNOWN' || !state.appliedSchemaVersion) {
      return {
        source: 'deployment',
        status: 'UNKNOWN',
        metrics: [],
        reason: 'PROVIDER_ERROR',
      };
    }

    return {
      source: 'deployment',
      status: 'AVAILABLE',
      metrics: [{ code: 'deployment.schema_drift', value: state.status === 'CRITICAL' ? 1 : 0 }],
    };
  }

  collectDeploymentState() {
    return this.readState();
  }
}
