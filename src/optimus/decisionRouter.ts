export type ExecutionTarget =
  | "OPTIMUS_DOER_API"
  | "OPTIMUS_SUPERAGENT"
  | "GEM_CREATIVE_MEDIA"
  | "SKILL_PREP_MEETINGS"
  | "SKILL_MORE_PERSPECTIVES"
  | "SKILL_FRESH_IDEAS"
  | "SKILL_FOCUS_ENERGY"
  | "SKILL_WRITING_STYLE"
  | "COMPLIANCE_HUMAN_ESCALATION";

export const EXECUTION_TARGETS: readonly ExecutionTarget[] = [
  "OPTIMUS_DOER_API",
  "OPTIMUS_SUPERAGENT",
  "GEM_CREATIVE_MEDIA",
  "SKILL_PREP_MEETINGS",
  "SKILL_MORE_PERSPECTIVES",
  "SKILL_FRESH_IDEAS",
  "SKILL_FOCUS_ENERGY",
  "SKILL_WRITING_STYLE",
  "COMPLIANCE_HUMAN_ESCALATION",
];

export type RiskLevel = "LOW" | "MODERATE" | "HIGH_IMPACT";

export interface DecisionRoutingResult {
  selectedRoute: ExecutionTarget;
  confidence: number;
  riskLevel: RiskLevel;
  abstained: boolean;
  latencyMs: number;
  probabilities: Record<string, number>;
  /** Why the router refused to trust the model, when it did. */
  escalationReason?: string;
}

/** Thresholds from manifest.cta.json. */
export const CONFIDENCE_FLOOR = 0.72;
export const HIGH_IMPACT_THRESHOLD = 0.4;
export const MAX_IMAGES = 8;

/** What the decision endpoint is expected to return. Anything else is rejected. */
export interface RawDecision {
  choice?: unknown;
  probabilities?: unknown;
  risk?: unknown;
  abstain?: unknown;
}

export type DecisionTransport = (req: {
  model: string;
  prompt: string;
  images: string[];
  choices: readonly ExecutionTarget[];
}) => Promise<RawDecision>;

const isTarget = (v: unknown): v is ExecutionTarget =>
  typeof v === "string" && (EXECUTION_TARGETS as readonly string[]).includes(v);

/**
 * Gatekeeper in front of every executor.
 *
 * Fails closed: a transport error, malformed reply, abstention, confidence
 * under the floor, or high-impact risk all route to COMPLIANCE_HUMAN_ESCALATION.
 * A worker agent is never handed a task the model was unsure about.
 */
export class MicrosoftDecisionRouter {
  constructor(
    private readonly transport: DecisionTransport,
    private readonly clock: () => number = () => performance.now()
  ) {}

  /** Production transport: a real HTTPS call, zero-data-retention header set. */
  static overHttp(apiKey: string, endpoint = "https://openrouter.ai/api/v1/decisions"): DecisionTransport {
    return async (req) => {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "X-Zero-Data-Retention": "true",
        },
        body: JSON.stringify({
          model: req.model,
          state: { prompt: req.prompt, images: req.images },
          questions: [{ id: "route", type: "choice", options: req.choices }],
        }),
      });
      if (!res.ok) throw new Error(`DECISION_HTTP_${res.status}`);
      return (await res.json()) as RawDecision;
    };
  }

  private escalate(reason: string, start: number, probabilities: Record<string, number> = {}): DecisionRoutingResult {
    return {
      selectedRoute: "COMPLIANCE_HUMAN_ESCALATION",
      confidence: 0,
      riskLevel: "HIGH_IMPACT",
      abstained: true,
      latencyMs: this.clock() - start,
      probabilities,
      escalationReason: reason,
    };
  }

  public async evaluateAndRoute(sanitizedInput: string, imageUrls: string[] = []): Promise<DecisionRoutingResult> {
    const start = this.clock();
    let raw: RawDecision;
    try {
      raw = await this.transport({
        model: "microsoft/microsoft-decision-1.1",
        prompt: sanitizedInput,
        images: imageUrls.slice(0, MAX_IMAGES),
        choices: EXECUTION_TARGETS,
      });
    } catch (e) {
      return this.escalate(`transport failure: ${(e as Error).message}`, start);
    }

    if (!raw || typeof raw !== "object") return this.escalate("malformed decision reply", start);
    if (raw.abstain === true) return this.escalate("model abstained", start);
    if (!isTarget(raw.choice)) return this.escalate("model chose an unknown route", start);

    const probs: Record<string, number> = {};
    if (raw.probabilities && typeof raw.probabilities === "object") {
      for (const [k, v] of Object.entries(raw.probabilities as Record<string, unknown>)) {
        if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1) probs[k] = v;
      }
    }
    const confidence = probs[raw.choice];
    if (confidence === undefined) return this.escalate("no calibrated probability for the chosen route", start, probs);

    const riskScore = typeof raw.risk === "number" && Number.isFinite(raw.risk) ? raw.risk : 1;
    const riskLevel: RiskLevel = riskScore >= HIGH_IMPACT_THRESHOLD ? "HIGH_IMPACT" : riskScore >= 0.15 ? "MODERATE" : "LOW";

    if (confidence < CONFIDENCE_FLOOR) return this.escalate(`confidence ${confidence} under floor ${CONFIDENCE_FLOOR}`, start, probs);
    if (riskLevel === "HIGH_IMPACT") return this.escalate(`risk ${riskScore} at or above ${HIGH_IMPACT_THRESHOLD}`, start, probs);

    return {
      selectedRoute: raw.choice,
      confidence,
      riskLevel,
      abstained: false,
      latencyMs: this.clock() - start,
      probabilities: probs,
    };
  }
}
