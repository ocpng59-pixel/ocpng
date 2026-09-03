const DEFAULT_TIMEOUT_MS = 8_000;

function unknown(reason) {
  return {
    source: 'application',
    status: 'UNKNOWN',
    metrics: [],
    reason,
  };
}

function safeLatency(startedAt, finishedAt) {
  const latency = Math.round(finishedAt - startedAt);
  return Number.isFinite(latency) && latency >= 0 ? latency : 0;
}

export class ApplicationHealthProvider {
  constructor(input) {
    this.publicAppUrl = input.publicAppUrl;
    this.fetchImpl = input.fetchImpl ?? fetch;
    this.timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.nowMs = input.nowMs ?? (() => Date.now());
  }

  async collect() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = this.nowMs();

    let response;
    try {
      response = await this.fetchImpl(new URL('/api/health', this.publicAppUrl).toString(), {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });
    } catch {
      return unknown('PROVIDER_UNAVAILABLE');
    } finally {
      clearTimeout(timeout);
    }

    const latency = safeLatency(startedAt, this.nowMs());
    if (!response.ok) {
      return {
        source: 'application',
        status: 'AVAILABLE',
        metrics: [
          { code: 'app.availability', value: 0 },
          { code: 'app.response_latency_ms', value: latency },
        ],
      };
    }

    try {
      const payload = await response.json();
      if (!payload || payload.status !== 'ok') return unknown('PROVIDER_ERROR');
    } catch {
      return unknown('PROVIDER_ERROR');
    }

    return {
      source: 'application',
      status: 'AVAILABLE',
      metrics: [
        { code: 'app.availability', value: 1 },
        { code: 'app.response_latency_ms', value: latency },
      ],
    };
  }
}
