import type { AssertionGate, AssertionResult, HealthSnapshot } from '../types.js';

const fail = (failedMetric: string, code: string, details = ''): AssertionResult =>
  ({ ok: false, failedMetric, code, details });

const num = (s: HealthSnapshot, k: string, d = 0): number => Number(s.metrics[k] ?? d);
const ok1 = (s: HealthSnapshot, k: string, d = 0): number => (num(s, k, d) === 1 ? 1 : 0);

export const S0Gate: AssertionGate = {
  id: 'S0_INIT', stateId: 'S0',
  evaluate(s) {
    if (!ok1(s, 's0.runtime.init_status')) return fail('s0.runtime.init_status', 'E_INIT_NOT_READY');
    if (num(s, 's0.memory.heap_available_mb') <= 512) return fail('s0.memory.heap_available_mb', 'E_HARDWARE_OOM');
    if (num(s, 's0.store.redis_ping_latency_ms', 999) >= 5) return fail('s0.store.redis_ping_latency_ms', 'E_REDIS_UNREACHABLE');
    return { ok: true };
  },
};

export const S1Gate: AssertionGate = {
  id: 'S1_GOVERNANCE', stateId: 'S1',
  evaluate(s) {
    if (!ok1(s, 's1.governance.active_version_hash')) return fail('s1.governance.active_version_hash', 'E_GOV_HASH_MISMATCH');
    if (num(s, 's1.governance.rule_parse_error_count') > 0) return fail('s1.governance.rule_parse_error_count', 'E_GOV_PARSE_FAIL');
    if (!ok1(s, 's1.governance.matrix_signature_valid')) return fail('s1.governance.matrix_signature_valid', 'E_GOV_SIGNATURE_INVALID');
    return { ok: true };
  },
};

export const S2Gate: AssertionGate = {
  id: 'S2_EPISTEMIC', stateId: 'S2',
  evaluate(s) {
    if (!ok1(s, 's2.epistemic.evidence_chain_validity')) return fail('s2.epistemic.evidence_chain_validity', 'E_EVIDENCE_CHAIN_BROKEN');
    if (num(s, 's2.epistemic.graph_node_corruption_count') > 0) return fail('s2.epistemic.graph_node_corruption_count', 'E_GRAPH_CORRUPTION');
    if (num(s, 's2.epistemic.satisfaction_latency_ms', 999) >= 50) return fail('s2.epistemic.satisfaction_latency_ms', 'E_EPISTEMIC_DEADLOCK');
    return { ok: true };
  },
};

export const S3Gate: AssertionGate = {
  id: 'S3_INGEST', stateId: 'S3',
  evaluate(s) {
    if (num(s, 's3.ingest.temporal_drift_ms', 999) >= 15) return fail('s3.ingest.temporal_drift_ms', 'E_INGEST_DESYNC');
    if (num(s, 's3.ingest.buffer_saturation_ratio', 1) >= 0.8) return fail('s3.ingest.buffer_saturation_ratio', 'E_BUFFER_OVERFLOW');
    if (num(s, 's3.ingest.verification_drop_count') >= 5) return fail('s3.ingest.verification_drop_count', 'E_INGEST_DROPS');
    return { ok: true };
  },
};

export const S4Gate: AssertionGate = {
  id: 'S4_SANDBOX', stateId: 'S4',
  evaluate(s) {
    if (!ok1(s, 's4.sandbox.scenegraph_cloned')) return fail('s4.sandbox.scenegraph_cloned', 'E_SCENEGRAPH_NOT_CLONED');
    if (num(s, 's4.sandbox.isolation_leak_count') > 0) return fail('s4.sandbox.isolation_leak_count', 'E_SANDBOX_LEAK');
    if (num(s, 's4.sandbox.risk_score', 1) >= 0.35) return fail('s4.sandbox.risk_score', 'E_HIGH_RISK_MUTATION');
    return { ok: true };
  },
};

export const S5Gate: AssertionGate = {
  id: 'S5_COMMIT', stateId: 'S5',
  evaluate(s) {
    if (!ok1(s, 's5.commit.ledger_write_permission')) return fail('s5.commit.ledger_write_permission', 'LEDGER_WRITE_DENIED');
    if (!ok1(s, 's5.commit.rollback_ready_flag')) return fail('s5.commit.rollback_ready_flag', 'E_LKG_MISSING');
    if (num(s, 's5.commit.audit_stream_ack_latency_ms', 999) >= 10) return fail('s5.commit.audit_stream_ack_latency_ms', 'E_AUDIT_TIMEOUT');
    return { ok: true };
  },
};

export const S6Gate: AssertionGate = {
  id: 'S6_HARNESS', stateId: 'S6',
  evaluate(s) {
    if (!ok1(s, 's6.harness.startup_test_suite_passed')) return fail('s6.harness.startup_test_suite_passed', 'E_HARNESS_TEST_FAIL');
    if (!ok1(s, 's6.harness.mcp_tool_handshake_ok')) return fail('s6.harness.mcp_tool_handshake_ok', 'E_MCP_HANDSHAKE_FAIL');
    if (num(s, 's6.harness.api_contract_drift') > 0) return fail('s6.harness.api_contract_drift', 'E_API_CONTRACT_DRIFT');
    return { ok: true };
  },
};

export const S7Gate: AssertionGate = {
  id: 'S7_HANDSHAKE', stateId: 'S7',
  evaluate(s) {
    if (!ok1(s, 's7.identity.session_token_valid')) return fail('s7.identity.session_token_valid', 'E_HANDSHAKE_INVALID');
    if (!ok1(s, 's7.identity.role_permissions_bound')) return fail('s7.identity.role_permissions_bound', 'E_ROLE_UNBOUND');
    if (!ok1(s, 's7.handshake.challenge_response_verified')) return fail('s7.handshake.challenge_response_verified', 'E_HANDSHAKE_INVALID');
    return { ok: true };
  },
};

export const S8Gate: AssertionGate = {
  id: 'S8_RUNTIME', stateId: 'S8',
  evaluate(s) {
    if (num(s, 's8.commit.audit_stream_ack_latency_ms', 999) >= 10) return fail('s8.commit.audit_stream_ack_latency_ms', 'E_AUDIT_TIMEOUT');
    if (num(s, 's8.ingest.temporal_drift_ms', 0) >= 15) return fail('s8.ingest.temporal_drift_ms', 'E_INGEST_DESYNC');
    if (num(s, 's8.sandbox.isolation_leak_count', 0) > 0) return fail('s8.sandbox.isolation_leak_count', 'E_SANDBOX_LEAK');
    return { ok: true };
  },
};

export const ALL_GATES: AssertionGate[] = [S0Gate, S1Gate, S2Gate, S3Gate, S4Gate, S5Gate, S6Gate, S7Gate, S8Gate];
