// In-process metric store. Replace with an OTLP reader in Phase 1.
type MetricValue = number | boolean;

export class MetricsRegistry {
  private values = new Map<string, MetricValue>();

  set(metric: string, value: MetricValue): void {
    this.values.set(metric, value);
  }

  get(metric: string, fallback: MetricValue = 0): MetricValue {
    return this.values.get(metric) ?? fallback;
  }

  snapshot(stateId: import('./types.js').StateId, timestamp = Date.now()) {
    return { stateId, timestamp, metrics: Object.fromEntries(this.values) };
  }

  all(): Record<string, MetricValue> {
    return Object.fromEntries(this.values);
  }
}

export const registry = new MetricsRegistry();
