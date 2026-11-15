import type { AssertionGate, AssertionResult, CircuitBreaker, HealthSnapshot } from './types.js';

/**
 * Evaluates every registered gate for the active state on a fixed interval.
 * Default cadence is 50 ms, matching the S8 continuous assertion spec.
 */
export class HealthVerifier {
  private gates: AssertionGate[] = [];
  private handle: ReturnType<typeof setInterval> | null = null;
  private lastFailure: { metric: string; at: number } | null = null;
  private suppressMs: number;

  constructor(
    private breaker: CircuitBreaker,
    options: { intervalMs?: number; suppressMs?: number } = {},
  ) {
    this.intervalMs = options.intervalMs ?? 50;
    this.suppressMs = options.suppressMs ?? 5000;
  }

  private intervalMs: number;

  registerGate(gate: AssertionGate): this {
    this.gates.push(gate);
    return this;
  }

  registerGates(gates: AssertionGate[]): this {
    gates.forEach((g) => this.registerGate(g));
    return this;
  }

  start(poll: () => Promise<HealthSnapshot>): void {
    if (this.handle) return;
    this.handle = setInterval(async () => {
      try {
        const snap = await poll();
        const results = this.gates
          .filter((g) => g.stateId === snap.stateId)
          .map((g) => g.evaluate(snap))
          .filter((r) => !r.ok);

        if (results.length === 0) return;

        const first = results[0];
        const metric = first.failedMetric ?? 'runtime.unknown';
        const now = Date.now();

        // Debounce so one sick metric does not hammer the recovery chain.
        if (this.lastFailure && this.lastFailure.metric === metric && now - this.lastFailure.at < this.suppressMs) {
          return;
        }
        this.lastFailure = { metric, at: now };

        await this.breaker.onFailure(snap, first as AssertionResult);
      } catch (err) {
        console.error('[verifier] poll failed:', (err as Error).message);
      }
    }, this.intervalMs);
  }

  stop(): void {
    if (this.handle) clearInterval(this.handle);
    this.handle = null;
  }
}
