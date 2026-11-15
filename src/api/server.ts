import { createServer } from 'node:http';
import { registry } from '../telemetry/registry.js';
import { HealthVerifier } from '../telemetry/verifier.js';
import { ALL_GATES } from '../telemetry/gates/index.js';
import { createHandlers } from '../kernel/recovery/handlers.js';
import { SovereignCircuitBreaker } from '../kernel/recovery/circuitBreaker.js';
import { createPoller } from '../kernel/healthPoller.js';
import { AuditLedger } from '../ledger/ledger.js';
import type { StateId, RecoveryTier } from '../telemetry/types.js';

const PORT = Number(process.env.PORT ?? 8080);
const DEMO = process.argv.includes('--demo');

const STATE: { current: StateId } = { current: 'S8' };

const breaker = new SovereignCircuitBreaker(
  createHandlers([
    { name: 'ingest', onDegradeIngest: async () => { registry.set('s3.ingest.mode', 1); } },
    { name: 'sandbox', onSandboxOnly: async () => { registry.set('s4.sandbox.mode', 1); } },
    { name: 'governance', onSafeMode: async () => { registry.set('s1.governance.mode', 1); } },
    { name: 'runtime', onEmergencyReset: async () => { registry.set('s0.runtime.init_status', 0); } },
  ]),
);

const verifier = new HealthVerifier(breaker, { intervalMs: 50 }).registerGates(ALL_GATES);
verifier.start(createPoller(() => STATE.current));

const ledger = new AuditLedger();
ledger.snapshot('boot');

// Healthy baseline
registry.set('s0.runtime.init_status', 1);
registry.set('s0.memory.heap_available_mb', 2048);
registry.set('s0.store.redis_ping_latency_ms', 2.1);
registry.set('s1.governance.active_version_hash', 1);
registry.set('s1.governance.rule_parse_error_count', 0);
registry.set('s1.governance.matrix_signature_valid', 1);
registry.set('s2.epistemic.evidence_chain_validity', 1);
registry.set('s2.epistemic.graph_node_corruption_count', 0);
registry.set('s2.epistemic.satisfaction_latency_ms', 12);
registry.set('s3.ingest.temporal_drift_ms', 4);
registry.set('s3.ingest.buffer_saturation_ratio', 0.31);
registry.set('s3.ingest.verification_drop_count', 0);
registry.set('s4.sandbox.scenegraph_cloned', 1);
registry.set('s4.sandbox.isolation_leak_count', 0);
registry.set('s4.sandbox.risk_score', 0.12);
registry.set('s5.commit.ledger_write_permission', 1);
registry.set('s5.commit.rollback_ready_flag', 1);
registry.set('s5.commit.audit_stream_ack_latency_ms', 3.4);
registry.set('s6.harness.startup_test_suite_passed', 1);
registry.set('s6.harness.mcp_tool_handshake_ok', 1);
registry.set('s6.harness.api_contract_drift', 0);
registry.set('s7.identity.session_token_valid', 1);
registry.set('s7.identity.role_permissions_bound', 1);
registry.set('s7.handshake.challenge_response_verified', 1);
registry.set('s8.commit.audit_stream_ack_latency_ms', 3.4);
registry.set('s8.ingest.temporal_drift_ms', 4);
registry.set('s8.sandbox.isolation_leak_count', 0);

// Demo: inject a drift spike after 3 seconds, exactly like the sales demo.
if (DEMO) {
  setTimeout(() => {
    console.log('[demo] injecting s8.ingest.temporal_drift_ms = 22');
    registry.set('s8.ingest.temporal_drift_ms', 22);
  }, 3000);
}

function json(res: import('node:http').ServerResponse, code: number, body: unknown) {
  const text = JSON.stringify(body, null, 2);
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(text);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, {
      state: STATE.current,
      metrics: registry.all(),
      ledger: { entries: ledger.size, chainValid: ledger.verifyChain(), lkg: ledger.lkg },
      transitions: breaker.transitions.slice(-10),
      escalationChain: breaker.escalationChain() as RecoveryTier[],
    });
  }

  if (req.method === 'POST' && url.pathname === '/metrics') {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = JSON.parse(Buffer.concat(chunks).toString() || '{}') as Record<string, number | boolean>;
    for (const [k, v] of Object.entries(body)) registry.set(k, v);
    return json(res, 202, { accepted: Object.keys(body) });
  }

  if (req.method === 'POST' && url.pathname === '/simulate/failure') {
    const metric = url.searchParams.get('metric') ?? 's8.ingest.temporal_drift_ms';
    const value = Number(url.searchParams.get('value') ?? 25);
    registry.set(metric, value);
    return json(res, 202, { injected: { [metric]: value } });
  }

  if (req.method === 'POST' && url.pathname === '/agent/execute') {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = JSON.parse(Buffer.concat(chunks).toString() || '{}') as
      { action?: string; resource?: string; payload?: unknown };

    const entry = ledger.append({
      id: `act-${Date.now()}`,
      timestamp: Date.now(),
      actorId: 'agent-1',
      action: body.action ?? 'noop',
      resource: body.resource ?? 'unknown',
      payload: body.payload ?? {},
      result: { sandboxed: true },
    });
    return json(res, 200, { ok: true, entry });
  }

  if (req.method === 'GET' && url.pathname === '/ledger') {
    const limit = Number(url.searchParams.get('limit') ?? 20);
    return json(res, 200, { chainValid: ledger.verifyChain(), entries: ledger.list(limit) });
  }

  json(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log(`cyphertube kernel listening on :${PORT}${DEMO ? ' (demo mode)' : ''}`);
});

const shutdown = () => { verifier.stop(); server.close(() => process.exit(0)); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
