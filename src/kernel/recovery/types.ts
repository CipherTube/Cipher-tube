import type { RecoveryTier } from '../../telemetry/types.js';

export interface RecoveryContext {
  reason: string;
  code?: string;
  failedMetric?: string;
  stateId: string;
  timestamp: number;
  tier: RecoveryTier;
}

export interface RecoveryHandler {
  tier: RecoveryTier;
  handle(ctx: RecoveryContext): Promise<void>;
}

export interface Subsystem {
  name: string;
  onDegradeIngest?(): Promise<void>;
  onSandboxOnly?(): Promise<void>;
  onSafeMode?(): Promise<void>;
  onEmergencyReset?(): Promise<void>;
}
