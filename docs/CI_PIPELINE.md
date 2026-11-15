# CipherTube analysis, scanner, autofix and tracer pipeline

Four workflows, all shell-only. This repository allows local actions only, so any
`uses:` step fails at startup. Everything below runs commands directly.

| workflow | trigger | what it does |
|---|---|---|
| `analysis.yml` | push, pull request, manual | ruff lint, bandit security lint, format check, byte-compile every module, TypeScript type check, radon complexity |
| `scanners.yml` | push, pull request, nightly 06:00 UTC, manual | gitleaks secret scan, trivy filesystem and misconfiguration scan, npm audit, pip-audit |
| `autofix.yml` | weekly Monday 07:00 UTC, manual | ruff fix and format, lockfile fixes, permissions normalisation, then a branch and a pull request |
| `trace.yml` | after analysis or scanners finish, manual | one record per commit, hash over the record, posted to the agent hub ledger |

## Alerts

Every workflow ends with the same call:

```
notify <status> <subject> <detail>
```

from `scripts/ci/lib.sh`. It posts to whichever of these are configured and never
fails the build:

1. `CI_HUB_URL` and `CI_HUB_KEY`, the CipherTube agent hub, room `ciphertube`
2. `SLACK_WEBHOOK`
3. `DISCORD_WEBHOOK`

Scanner findings send `alert`; clean runs send `success`, so a silent inbox means
the pipeline is healthy rather than unwatched.

## Traces

`trace.yml` writes `trace.json`:

```
commit, repo, ref, actor, recorded_at
stages: { name: { conclusion, run_id, duration_s, url } }
missing_stages, overall, record_hash
```

`record_hash` is SHA-256 over the record with the hash field removed, so a trace
file can be compared later without trusting where it was stored. The same record
is posted to the hub ledger, which is append-only and hash-chained.

## Autofix safety

Autofix never writes to `main`. It creates `ci/autofix-<run id>`, commits, pushes
and opens a pull request. If there is nothing to fix it posts a success alert and
exits without touching the repository.

## Adding a scanner

1. Write the tool's JSON to a file.
2. Add a handler to `scripts/ci/report.py` and register it in `HANDLERS`.
3. Call it in `scanners.yml`, then add its count to the verdict step.

No workflow permissions change is needed for a read-only scanner.
