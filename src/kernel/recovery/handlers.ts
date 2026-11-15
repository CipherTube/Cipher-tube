import type { RecoveryContext, RecoveryHandler, Subsystem } from './types.js';

/**
 * Recovery handlers are deliberately boring: each one degrades a well-known
 * slice of the system and records what it did. Phase 1 swaps the console calls
 * for real subsystem calls and OTLP spans.
 */
export function createHandlers(subsystems: Subsystem[]): Record<string, RecoveryHandler> {
  return {
    DEGRADED_INGEST: {
      tier: 'DEGRADED_INGEST',
      async handle(ctx: RecoveryContext) {
        console.warn('[recovery] DEGRADED_INGEST', ctx.failedMetric ?? ctx.reason);
        for (const s of subsystems) await s.onDegradeIngest?.();
      },
    },
    SANDBOX_ONLY: {
      tier: 'SANDBOX_ONLY',
      async handle(ctx: RecoveryContext) {
        console.warn('[recovery] SANDBOX_ONLY', ctx.failedMetric ?? ctx.reason);
        for (const s of subsystems) await s.onSandboxOnly?.();
      },
    },
    SAFE_MODE: {
      tier: 'SAFE_MODE',
      async handle(ctx: RecoveryContext) {
        console.warn('[recovery] SAFE_MODE', ctx.failedMetric ?? ctx.reason);
        for (const s of subsystems) await s.onSafeMode?.();
      },
    },
    EMERGENCY_S0_RESET: {
      tier: 'EMERGENCY_S0_RESET',
      async handle(ctx: RecoveryContext) {
        console.error('[recovery] EMERGENCY_S0_RESET', ctx.failedMetric ?? ctx.reason);
        for (const s of subsystems) await s.onEmergencyReset?.();
      },
    },
  };
}
