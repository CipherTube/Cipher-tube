import { createHash } from "node:crypto";
import type { KeyValueStore } from "./store";
import { CipherTubeAssembly, type CipherTubePacket, type Jurisdiction } from "./cipherTube";
import { MicrosoftDecisionRouter, type ExecutionTarget } from "./decisionRouter";
import { vetUrl, type Resolver } from "./netGuard";
import { sanitizeDom } from "./domSanitizer";
import { sanitize } from "./siAgentOptimus";

export const BROWSER_TELEMETRY_KEY = "cisi:browser:telemetry";
const MAX_BODY_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;

export interface CiSISearchRequest {
  queryOrUrl: string;
  mode: "DEEP_SEARCH" | "URL_INSPECT" | "MULTIMODAL_VISION";
  pageScreenshotBase64?: string;
  rawDomHtml?: string;
  jurisdiction: Jurisdiction;
}

export interface CiSIBrowserResponse {
  tubeId: string;
  securityStatus: "VERIFIED_CLEAN" | "INJECTION_BLOCKED" | "ESCALATED_HOLD";
  assignedAgent: ExecutionTarget;
  decisionConfidence: number;
  latencyMs: number;
  sealedResultTube: CipherTubePacket;
  complianceAuditId: string;
}

/**
 * A fetch that never carries ambient authority: no cookies, no credentials,
 * manual redirects so each hop is re-vetted. Injected so tests never hit a network.
 */
export type SandboxFetch = (url: string, init: { redirect: "manual"; credentials: "omit"; headers: Record<string, string> }) =>
  Promise<{ status: number; headers: { get(name: string): string | null }; text(): Promise<string> }>;

export class CiSIWebBrowserEngine {
  constructor(
    private readonly store: KeyValueStore,
    private readonly cta: CipherTubeAssembly,
    private readonly router: MicrosoftDecisionRouter,
    private readonly fetchPage: SandboxFetch,
    private readonly resolver?: Resolver
  ) {}

  /** Follow redirects by hand, re-vetting every hop so a public URL cannot bounce to a private one. */
  private async safeGet(startUrl: string): Promise<{ html: string } | { blocked: string }> {
    let current = startUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const verdict = await vetUrl(current, this.resolver);
      if (!verdict.ok) return { blocked: verdict.reason };
      const res = await this.fetchPage(verdict.url.toString(), {
        redirect: "manual",
        credentials: "omit",
        headers: { "User-Agent": "CiSI-Sandbox/1.1", Accept: "text/html,text/plain" },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return { blocked: "REDIRECT_WITHOUT_LOCATION" };
        current = new URL(loc, verdict.url).toString();
        continue;
      }
      if (res.status >= 400) return { blocked: `UPSTREAM_${res.status}` };
      const body = await res.text();
      return { html: body.length > MAX_BODY_BYTES ? body.slice(0, MAX_BODY_BYTES) : body };
    }
    return { blocked: "TOO_MANY_REDIRECTS" };
  }

  public async browse(userId: string, sessionId: string, req: CiSISearchRequest): Promise<CiSIBrowserResponse> {
    const t0 = Date.now();
    let html = req.rawDomHtml ?? "";
    let status: CiSIBrowserResponse["securityStatus"] = "VERIFIED_CLEAN";
    let blockedReason: string | undefined;

    if (req.mode === "URL_INSPECT") {
      const got = await this.safeGet(req.queryOrUrl);
      if ("blocked" in got) {
        blockedReason = got.blocked;
        status = "ESCALATED_HOLD";
      } else {
        html = got.html;
      }
    }

    const page = sanitizeDom(html);
    const pii = sanitize(page.text);
    const r = page.removed;
    if (!blockedReason && (r.injectionPhrases > 0 || r.hiddenElements > 0)) status = "INJECTION_BLOCKED";

    // Only cleaned text and the query reach the router. Raw HTML never does.
    const decision = blockedReason
      ? await this.router.evaluateAndRoute("[blocked fetch]")
      : await this.router.evaluateAndRoute(`${req.queryOrUrl}\n\n${pii.sanitized.slice(0, 4000)}`);
    if (decision.abstained && status === "VERIFIED_CLEAN") status = "ESCALATED_HOLD";

    const tube = await this.cta.sealIntoTube(
      userId,
      sessionId,
      {
        mode: req.mode,
        query: req.queryOrUrl,
        securityStatus: status,
        blockedReason,
        removed: r,
        piiRedacted: pii.piiRedactedCount,
        content: blockedReason ? "" : pii.sanitized,
      },
      req.jurisdiction
    );

    const auditHash = createHash("sha256").update(`${tube.tubeId}:${status}:${tube.complianceAttestation.auditHash}`).digest("hex");
    await this.store.rpush(
      BROWSER_TELEMETRY_KEY,
      JSON.stringify({ tubeId: tube.tubeId, mode: req.mode, status, blockedReason, removed: r, auditHash, at: new Date().toISOString() })
    );

    return {
      tubeId: tube.tubeId,
      securityStatus: status,
      assignedAgent: decision.selectedRoute,
      decisionConfidence: decision.confidence,
      latencyMs: Date.now() - t0,
      sealedResultTube: tube,
      complianceAuditId: auditHash,
    };
  }
}
