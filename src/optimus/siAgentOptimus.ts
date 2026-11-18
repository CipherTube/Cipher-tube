import type { KeyValueStore } from "./store";
import { CipherTubeAssembly, type CipherTubePacket, type Jurisdiction } from "./cipherTube";
import { MicrosoftDecisionRouter, type ExecutionTarget } from "./decisionRouter";

export interface OptimusExecutionResponse {
  status: "COMPLETED" | "ESCALATED_FOR_REVIEW";
  executedBy: ExecutionTarget;
  routerMetrics: { confidence: number; riskLevel: string; latencyMs: number };
  outputTube: CipherTubePacket;
  complianceAuditId: string;
  piiRedactedCount: number;
}

/** A specialist is any async function from sanitized prompt to a JSON result. */
export type Specialist = (prompt: string, ctx: Record<string, unknown>) => Promise<Record<string, unknown>>;

export class OptimusThrottleError extends Error {
  constructor(public readonly maxRps: number) {
    super(`OPTIMUS_THROTTLE: Rate limit (${maxRps} req/s) exceeded.`);
    this.name = "OptimusThrottleError";
  }
}

/**
 * Ordered most specific first. A key or SSN must be claimed before the broad
 * card pattern can swallow it, and the card pattern requires a real digit run
 * so ordinary numbers and phone numbers are left alone.
 */
const PII_PATTERNS: RegExp[] = [
  /(?:sk-[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16})/g,
  /\b\d{3}-\d{2}-\d{4}\b/g,
  /\b(?:\d{4}[ -]?){3}\d{4}\b/g,
];
export const REDACTION = "[REDACTED_BY_CTA_COMPLIANCE]";

export function sanitize(rawText: string): { sanitized: string; piiRedactedCount: number } {
  let count = 0;
  let out = rawText;
  for (const p of PII_PATTERNS) {
    out = out.replace(p, () => {
      count += 1;
      return REDACTION;
    });
  }
  return { sanitized: out, piiRedactedCount: count };
}

/**
 * Orchestrator: throttle, sanitize, route, execute, seal.
 *
 * The throttle is a one-second fixed window per user hash. That is what the
 * spec binds (Redis INCR + EXPIRE) and it is cheap, but a caller can land
 * 2x maxRps across a window boundary. Swap in a sliding window if that matters.
 */
export class SiAgentOptimusEngine {
  constructor(
    private readonly store: KeyValueStore,
    private readonly cta: CipherTubeAssembly,
    private readonly router: MicrosoftDecisionRouter,
    private readonly specialists: Partial<Record<ExecutionTarget, Specialist>>,
    private readonly maxRps = 2
  ) {}

  private async enforceTokenBucket(userIdHash: string): Promise<void> {
    const key = `optimus:ratelimit:${userIdHash}`;
    const n = await this.store.incr(key);
    if (n === 1) await this.store.expire(key, 1);
    if (n > this.maxRps) throw new OptimusThrottleError(this.maxRps);
  }

  public async execute(
    userId: string,
    sessionId: string,
    rawPrompt: string,
    jurisdiction: Jurisdiction = "GLOBAL",
    imageUrls: string[] = []
  ): Promise<OptimusExecutionResponse> {
    const { createHash } = await import("node:crypto");
    const userIdHash = createHash("sha256").update(userId).digest("hex");
    await this.enforceTokenBucket(userIdHash);

    const { sanitized, piiRedactedCount } = sanitize(rawPrompt);
    const decision = await this.router.evaluateAndRoute(sanitized, imageUrls);
    const metrics = { confidence: decision.confidence, riskLevel: decision.riskLevel, latencyMs: decision.latencyMs };

    // Escalation path: the specialist is never called, and the held request is sealed for a human.
    const specialist = this.specialists[decision.selectedRoute];
    if (decision.abstained || decision.selectedRoute === "COMPLIANCE_HUMAN_ESCALATION" || !specialist) {
      const tube = await this.cta.sealIntoTube(
        userId,
        sessionId,
        { held: true, reason: decision.escalationReason ?? "no executor bound for route", prompt: sanitized },
        jurisdiction
      );
      return {
        status: "ESCALATED_FOR_REVIEW",
        executedBy: "COMPLIANCE_HUMAN_ESCALATION",
        routerMetrics: metrics,
        outputTube: tube,
        complianceAuditId: tube.complianceAttestation.auditHash,
        piiRedactedCount,
      };
    }

    const result = await specialist(sanitized, { jurisdiction, imageCount: imageUrls.length });
    const tube = await this.cta.sealIntoTube(userId, sessionId, result, jurisdiction);
    return {
      status: "COMPLETED",
      executedBy: decision.selectedRoute,
      routerMetrics: metrics,
      outputTube: tube,
      complianceAuditId: tube.complianceAttestation.auditHash,
      piiRedactedCount,
    };
  }
}
