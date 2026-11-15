export type StateId = 'S0'|'S1'|'S2'|'S3'|'S4'|'S5'|'S6'|'S7'|'S8';

export type RecoveryTier = 'DEGRADED_INGEST'|'SANDBOX_ONLY'|'SAFE_MODE'|'EMERGENCY_S0_RESET';

export interface HealthSnapshot {
  stateId: StateId;
  timestamp: number;
  metrics: Record<string, number | boolean>;
}

export interface AssertionResult {
  ok: boolean;
  failedMetric?: string;
  code?: string;
  details?: string;
}

export interface AssertionGate {
  id: string;
  stateId: StateId;
  evaluate(snapshot: HealthSnapshot): AssertionResult;
}

export interface CircuitBreaker {
  onFailure(snapshot: HealthSnapshot, result: AssertionResult): Promise<void>;
}
