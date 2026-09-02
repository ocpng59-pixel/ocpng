import type { DatabaseRecoveryProvider, IdentityRecoveryProvider } from '../provider-types';
import type { IdentityRecoveryCoverage } from '../types';

type ProviderIdentityRecoveryProviderOptions = {
  recoveryProvider: DatabaseRecoveryProvider;
  requiredRecoveryTimeUnix: number;
};

function timestamp(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed / 1000 : null;
}

export class ProviderIdentityRecoveryProvider implements IdentityRecoveryProvider {
  private readonly recoveryProvider: DatabaseRecoveryProvider;
  private readonly requiredRecoveryTimeUnix: number;

  constructor(options: ProviderIdentityRecoveryProviderOptions) {
    this.recoveryProvider = options.recoveryProvider;
    this.requiredRecoveryTimeUnix = options.requiredRecoveryTimeUnix;
  }

  async verifyCoverage(): Promise<IdentityRecoveryCoverage> {
    const status = await this.recoveryProvider.listRecoveryPoints();
    const earliest = timestamp(status.earliestRecoveryTime);
    const latest = timestamp(status.latestRecoveryTime);
    const requested = this.requiredRecoveryTimeUnix;

    const covered =
      status.enabled === true &&
      Number.isSafeInteger(requested) &&
      requested > 0 &&
      earliest !== null &&
      latest !== null &&
      requested >= earliest &&
      requested <= latest;

    if (!covered) {
      return {
        covered: false,
        method: 'PROVIDER_RECOVERY_UNAVAILABLE',
        safeMetadata: { pitrEnabled: status.enabled === true },
      };
    }

    return {
      covered: true,
      method: 'VERIFIED_PROVIDER_RECOVERY',
      safeMetadata: {
        pitrEnabled: true,
        earliestRecoveryTime: status.earliestRecoveryTime,
        latestRecoveryTime: status.latestRecoveryTime,
      },
    };
  }
}
