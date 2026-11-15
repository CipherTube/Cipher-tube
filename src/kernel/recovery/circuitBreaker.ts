import type { AssertionResult, CircuitBreaker, HealthSnapshot, RecoveryTier } from '../../telemetry/types.js';
import type { RecoveryContext, RecoveryHandler } from './types.js';

const TIER_ORDER: RecoveryTier[] = ['DEGRADED_INGEST', 'SANDBOX_ONLY', 'SAFE_MODE', 'EMERGENCY_S0_RESET'];

/**
 * Maps a failed metric namespace to the cheapest tier that can contain it.
 * Never escalate to a heavier tier when a local one will do.
 */
export function mapMetricToTier(metric: string): RecoveryTier {
  if (metric.startsWith('s3.ingest.') || metric.startsWith('s8.ingest.')) return 'DEGRADED_INGEST';
  if (metric.startsWith('s4.sandbox.') || metric.startsWith('s8.sandbox.')) return 'SANDBOX_ONLY';
  if (metric.startsWith('s5.commit.') || metric.startsWith('s8.commit.')) return 'SANDBOX_ONLY';
  if (metric.startsWith('s1.governance.') || metric.startsWith('s2.epistemic.')) return 'SAFE_MODE';
  if (metric.startsWith('s7.') || metric.startsWith('s6.')) return 'SAFE_MODE';
  return 'EMERGENCY_S0_RESET';
}

export class SovereignCircuitBreaker implements CircuitBreaker {
  private history: RecoveryContext[] = [];
  private lastTierAt = new Map<RecoveryTier, number>();

  constructor(
    private handlers: Record<string, RecoveryHandler>,
    private opts: { cooldownMs?: number } = {},
  ) {}

  get transitions(): RecoveryContext[] {
    return [...this.history];
  }

  async onFailure(snapshot: HealthSnapshot, result: AssertionResult): Promise<void> {
    const tier = mapMetricToTier(result.failedMetric ?? 'runtime.unknown');
    const now = Date.now();
    const cooldown = this.opts.cooldownMs ?? 5000;

    const last = this.lastTierAt.get(tier) ?? 0;
    if (now - last < cooldown) return;
    this.lastTierAt.set(tier, now);

    const ctx: RecoveryContext = {
      tier,
      reason: result.details ?? result.code ?? 'assertion failed',
      code: result.code,
      failedMetric: result.failedMetric,
      stateId: snapshot.stateId,
      timestamp: now,
    };

    this.history.push(ctx);
    if (this.history.length > 200) this.history.shift();

    const handler = this.handlers[tier] ?? this.handlers.EMERGENCY_S0_RESET;
    await handler.handle(ctx);
  }

  /** Test hook: prove the chain is ordered and complete. */
  escalationChain(): RecoveryTier[] {
    return [...TIER_ORDER];
  }
}
