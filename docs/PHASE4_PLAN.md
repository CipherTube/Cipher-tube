# Phase 4 — Hardening & Staged Rollout Plan

**Status:** planning (kicked off 2026-09-13) · **Goal:** move from *buildable* to *production* — security sign-off, metric depth, and a rollout that protects users if anything regresses. Original CipherTube design throughout.

## Track A — Security hardening (gates for sign-off)

| # | Item | Done when |
|---|---|---|
| A1 | Dependency & code audit (CodeQL + secret scan already in repo workflows) | Zero high-severity findings on the release commit |
| A2 | Production gateway TLS 1.3 with a CA-issued cert (Let's Encrypt/Caddy) | `/health` over public HTTPS, valid chain |
| A3 | Android cert pins shipped in `network_security_config.xml`; desktop pin baked via `CIPHERTUBE_CERT_PIN` | Both clients fail-closed against a mitm'd gateway in test |
| A4 | Signing secrets live (per [docs/SIGNING_GUIDE.md](SIGNING_GUIDE.md)) | `apksigner verify` OK; mac build passes `spctl --assess`; notarytool history shows "Accepted" |
| A5 | Governance guard moved from default-allow to **enforce** for `/system/analytics` | Policy block (not just audit) observed on unauthenticated probe |
| A6 | Audit-chain drift watch: alert when `chainLength`/`lastHash` regress between polls | Runbook entry + test alert fired once |

## Track B — Staged rollout

1. **B1 Update-manifest endpoint** — serves the current version + audience flags; prerequisite for any public APK distribution (BUILD.md release gate).
2. **B2 Stage 10% → 50% → 100%** — each stage soaks ≥48h with metrics green (crash-free sessions, session-creation success rate, audit integrity).
3. **B3 Kill switch** — update-manifest can pin `hold` to freeze distribution instantly.
4. **B4 Promotion gate** — a stage only advances when its metrics hold; regressions roll back to the previous stage flag.

## Track C — Metrics (hooks into build priority P4)

- C1 High-throughput counters for policy decisions + audit events (Redis atomic, TTL'd — no new vendor).
- C2 `/system/analytics` extension: per-route latency, policy decision ratios, chain health deltas.
- C3 Alert thresholds documented in this file once baselined.

## Track D — Sign-off & production

- D1 Track A checklist fully green → security sign-off recorded in this doc.
- D2 Tag `v1.6.0-beta.1` → signed builds → staged rollout → tag `v1.6.0` production.

## Sequencing

A2 unblocks A3 (pins need the real cert) · A4 unblocks D2 · B1 can start now (pure gateway work) · C1–C2 can start now · A5/A6 after the metrics counters land (they give the drift watch its data).
