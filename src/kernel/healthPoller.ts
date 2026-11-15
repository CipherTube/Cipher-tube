import { registry } from '../telemetry/registry.js';
import type { HealthSnapshot, StateId } from '../telemetry/types.js';

/**
 * Phase 0 poller reads the in-process registry. Phase 1 replaces this with an
 * OpenTelemetry metric reader so the kernel evaluates real OTLP data.
 */
export function createPoller(stateProvider: () => StateId) {
  return async (): Promise<HealthSnapshot> => registry.snapshot(stateProvider());
}
