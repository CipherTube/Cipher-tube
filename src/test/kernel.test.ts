import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AuditLedger } from '../ledger/ledger.js';
import { mapMetricToTier } from '../kernel/recovery/circuitBreaker.js';
import { S0Gate, S3Gate, S5Gate } from '../telemetry/gates/index.js';

test('ledger hash chain is intact and grows append-only', () => {
  const l = new AuditLedger();
  l.append({ id: '1', timestamp: 1, actorId: 'a', action: 'x', resource: 'r', payload: {}, result: {} });
  l.append({ id: '2', timestamp: 2, actorId: 'a', action: 'y', resource: 'r', payload: {}, result: {} });
  assert.equal(l.verifyChain(), true);
  assert.equal(l.size, 2);
  l.snapshot('s1');
  assert.equal(l.lkg?.entryCount, 2);
});

test('tier mapping never over-escalates', () => {
  assert.equal(mapMetricToTier('s3.ingest.temporal_drift_ms'), 'DEGRADED_INGEST');
  assert.equal(mapMetricToTier('s4.sandbox.isolation_leak_count'), 'SANDBOX_ONLY');
  assert.equal(mapMetricToTier('s1.governance.active_version_hash'), 'SAFE_MODE');
  assert.equal(mapMetricToTier('s0.runtime.init_status'), 'EMERGENCY_S0_RESET');
});

test('gates enforce the documented thresholds', () => {
  assert.equal(S0Gate.evaluate({ stateId: 'S0', timestamp: 0, metrics: { 's0.runtime.init_status': 1, 's0.memory.heap_available_mb': 1024, 's0.store.redis_ping_latency_ms': 2 } }).ok, true);
  assert.equal(S0Gate.evaluate({ stateId: 'S0', timestamp: 0, metrics: { 's0.runtime.init_status': 1, 's0.memory.heap_available_mb': 100, 's0.store.redis_ping_latency_ms': 2 } }).code, 'E_HARDWARE_OOM');
  assert.equal(S3Gate.evaluate({ stateId: 'S3', timestamp: 0, metrics: { 's3.ingest.temporal_drift_ms': 15 } }).code, 'E_INGEST_DESYNC');
  assert.equal(S5Gate.evaluate({ stateId: 'S5', timestamp: 0, metrics: { 's5.commit.ledger_write_permission': 1, 's5.commit.rollback_ready_flag': 0, 's5.commit.audit_stream_ack_latency_ms': 2 } }).code, 'E_LKG_MISSING');
});
