import express, { Request, Response, Application, NextFunction } from 'express';
import { cipherTubeGateway } from './gateway/sessionMiddleware';
import { governanceGuard, governanceAudit } from './governance/gatewayGuard';
import { cache } from './cache/redisPool';
import { metricsSnapshot, observeLatency } from './governance/metricsCounters';
import { currentManifest, isAudienceEnabled } from './governance/updateManifest';

export const app: Application = express();
const PORT = process.env.GATEWAY_PORT || 8080;

// Standard body parsers restricted to essential sizes to prevent buffer exhaustion attacks
app.use(express.json({ limit: '10kb' }));

/**
 * ⏱️ Per-Route Latency Middleware (Phase 4 / Track C)
 * Records a latency sample for every request on response completion.
 * In-process sliding window (5 min, capped) -> p50/p99 in /system/analytics.
 * Zero allocation on the hot path beyond one sample per request.
 */
app.use((req: Request, res: Response, next: NextFunction) => {
    const startedAt = Date.now();
    res.on('finish', () => {
        observeLatency(req.path, Date.now() - startedAt);
    });
    next();
});

/**
 * 📊 Live Gateway Telemetry Endpoint
 * Exposes core state diagnostics and cache performance metrics safely.
 * Sentinel: Guarded by cipherTubeGateway middleware to prevent unauthorized metrics exposure.
 */
app.get('/system/analytics', cipherTubeGateway, governanceGuard, async (req: Request, res: Response) => {
    try {
        const cacheOpen = cache.rawClient.isOpen;
        // In a live environment, these are aggregated from internal memory markers
        const diagnosticSnapshot = {
            component: "Cipher-Tube Cryptographic Gateway",
            status: cacheOpen ? "Fully Operational" : "Degraded (Cache Disconnected)",
            timestamp: Date.now(),
            metrics: {
                engineUptime: process.uptime(),
                memoryUsage: process.memoryUsage().heapUsed,
                cachePoolActive: cacheOpen,
                governanceChainLength: governanceAudit.length,
                governanceChainIntact: governanceAudit.verify()
            },
            // Phase 4 / Track C: windowed policy/audit counters +
            // per-route latency percentiles (degraded=true when the
            // Redis pool is down — snapshot falls back to local tallies).
            phase4: await metricsSnapshot()
        };
        return res.status(200).json(diagnosticSnapshot);
    } catch (err) {
        return res.status(500).json({ error: "Failed to extract active telemetry." });
    }
});

/**
 * 🔒 Cryptographically Guarded Communication Pipeline
 * Mounts our zero-knowledge structural evaluation layer before granting downstream access.
 */
app.post('/v1/channel/verify', cipherTubeGateway, governanceGuard, (req: Request, res: Response) => {
    // If the request makes it here, it has passed all ZK validation boundaries
    return res.status(200).json({
        status: "verified",
        channelState: "secure",
        tokenSignature: (req as any).cipherState.originEpoch
    });
});

/**
 * 📦 Update Manifest (Phase 4 / Track B — B1)
 * Prerequisite for public APK/desktop distribution (BUILD.md release gate).
 * Serves the current version + staged-rollout audience flags, with a
 * runtime kill switch (ct:update:hold in Redis — freeze distribution
 * instantly, no redeploy).
 *
 * Guarded by governanceGuard (policy-as-code controls distribution) but
 * NOT by cipherTubeGateway: clients poll for updates before a session is
 * established, so the ZK challenge must not gate this endpoint. Audience
 * bucketing is deterministic and stateless — no per-device records.
 * Optional ?clientId= lets the server compute eligibility; the id is used
 * in-memory for bucketing only and is never stored.
 */
app.get('/update-manifest', governanceGuard, async (req: Request, res: Response) => {
    try {
        const manifest = await currentManifest();
        const clientId = typeof req.query.clientId === 'string' ? req.query.clientId : undefined;
        const clientVersionCode =
            typeof req.query.versionCode === 'string' ? Number(req.query.versionCode) : undefined;
        const eligibility = clientId
            ? isAudienceEnabled(
                  clientId,
                  manifest.status === 'hold' ? 0 : manifest.audiencePercent,
                  clientVersionCode,
                  manifest.minSupportedVersionCode
              )
            : undefined;
        return res.status(200).json({ ...manifest, eligible: eligibility });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to produce update manifest.' });
    }
});

/**
 * 🩺 Liveness Probe
 * Zero-dependency heartbeat for load balancers and Kubernetes (PLATFORM_SHIP_PLAN.md §9.5).
 * Returns 200 whenever the event loop is responsive. Deliberately NOT guarded by
 * cipherTubeGateway — LB probes must not be cryptographically challenged, and the
 * payload exposes no sensitive data (uptime + timestamp only).
 */
app.get('/health', (req: Request, res: Response) => {
    return res.status(200).json({
        status: "ok",
        uptime: process.uptime(),
        timestamp: Date.now()
    });
});

/**
 * 🚦 Readiness Probe
 * Verifies the Redis pipeline is reachable before orchestrators route traffic here.
 * Returns 503 when the cache is disconnected or unresponsive so the pod drains.
 */
app.get('/ready', async (req: Request, res: Response) => {
    try {
        if (!cache.rawClient.isOpen) {
            return res.status(503).json({ status: "not_ready", reason: "cache disconnected" });
        }
        const pong = await cache.rawClient.ping();
        if (pong !== 'PONG') {
            return res.status(503).json({ status: "not_ready", reason: "cache ping failed" });
        }
        return res.status(200).json({ status: "ready", cache: "connected", timestamp: Date.now() });
    } catch (err) {
        return res.status(503).json({ status: "not_ready", reason: "cache unreachable" });
    }
});

// Deep fallback handler for unmapped entry attempts
app.use((req: Request, res: Response) => {
    res.status(404).json({ status: "rejected", message: "Specified channel route does not exist." });
});

// Bootstrapping execution layer
if (process.env.NODE_ENV !== 'test') {
    const server = app.listen(PORT, () => {
        console.log(`🚀 [Cipher-Tube Core] Ephemeral gateway initialized on port ${PORT}`);
    });

    // Graceful breakdown procedures to maintain state cleanliness during cluster recycling
    process.on('SIGTERM', async () => {
        console.log('⚠️ [Cipher-Tube Core] SIGTERM detected. Closing connections gracefully...');
        server.close(async () => {
            if (cache.rawClient.isOpen) {
                await cache.rawClient.quit();
                console.log('📊 [Cache Telemetry] Redis pool connections terminated.');
            }
            process.exit(0);
        });
    });
}
