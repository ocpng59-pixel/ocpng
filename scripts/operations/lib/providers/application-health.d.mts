export type ApplicationHealthSnapshot = {
  source: 'application';
  status: 'AVAILABLE' | 'UNKNOWN';
  metrics: Array<{ code: string; value: number }>;
  reason?: 'PROVIDER_UNAVAILABLE' | 'PROVIDER_ERROR';
};

export class ApplicationHealthProvider {
  constructor(input: {
    publicAppUrl: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    nowMs?: () => number;
  });
  collect(): Promise<ApplicationHealthSnapshot>;
}
