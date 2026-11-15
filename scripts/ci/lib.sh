#!/usr/bin/env bash
# Shared helpers for the CipherTube analysis, scanner, autofix and tracer jobs.
# Sourced by every pipeline workflow so notifications behave identically.

set -uo pipefail

TRACE_DIR="${TRACE_DIR:-.trace}"
mkdir -p "$TRACE_DIR"

now() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

# notify <status> <subject> <detail>
# Sends to the CipherTube agent hub when CI_HUB_KEY is set, and to any
# SLACK_WEBHOOK / DISCORD_WEBHOOK configured. Never fails the build.
notify() {
  local status="$1" subject="$2" detail="${3:-}"
  local payload
  payload=$(python3 - "$status" "$subject" "$detail" <<'PY'
import json, sys
status, subject, detail = sys.argv[1], sys.argv[2], sys.argv[3]
print(json.dumps({
    "action": "post",
    "room": "ciphertube",
    "sender": "github-actions",
    "recipient": "all",
    "kind": "result" if status == "success" else "status",
    "subject": f"[CI {status.upper()}] {subject}",
    "body": detail,
    "meta": {"run": __import__("os").environ.get("GITHUB_RUN_ID"),
             "repo": __import__("os").environ.get("GITHUB_REPOSITORY"),
             "sha": __import__("os").environ.get("GITHUB_SHA", "")[:7]},
}, indent=2))
PY
)
  if [ -n "${CI_HUB_KEY:-}" ] && [ -n "${CI_HUB_URL:-}" ]; then
    curl -sS -m 20 -X POST "$CI_HUB_URL" \
      -H "content-type: application/json" \
      -H "x-hub-key: $CI_HUB_KEY" \
      -d "$payload" >/dev/null && echo "notified: hub" || echo "notify: hub failed"
  else
    echo "notify: no hub key set, skipping hub alert"
  fi

  if [ -n "${SLACK_WEBHOOK:-}" ]; then
    curl -sS -m 20 -X POST "$SLACK_WEBHOOK" \
      -H "content-type: application/json" \
      -d "{\"text\":\"[CI $status] $subject\"}" >/dev/null \
      && echo "notified: slack" || echo "notify: slack failed"
  fi

  if [ -n "${DISCORD_WEBHOOK:-}" ]; then
    curl -sS -m 20 -X POST "$DISCORD_WEBHOOK" \
      -H "content-type: application/json" \
      -d "{\"content\":\"[CI $status] $subject\"}" >/dev/null \
      && echo "notified: discord" || echo "notify: discord failed"
  fi
}

# trace_record <name> <verdict> <findings> <detail-file>
# Writes one JSON trace record: who, what commit, what ran, what it found.
trace_record() {
  local name="$1" verdict="$2" findings="$3" detail_file="${4:-}"
  python3 - "$name" "$verdict" "$findings" "$detail_file" "$TRACE_DIR" <<'PY'
import hashlib, json, os, sys, datetime

name, verdict, findings, detail_file, trace_dir = sys.argv[1:6]
env = os.environ

def digest(path):
    try:
        h = hashlib.sha256()
        with open(path, "rb") as fh:
            for chunk in iter(lambda: fh.read(65536), b""):
                h.update(chunk)
        return h.hexdigest()
    except OSError:
        return None

record = {
    "stage": name,
    "verdict": verdict,
    "findings": int(findings or 0),
    "repo": env.get("GITHUB_REPOSITORY"),
    "commit": env.get("GITHUB_SHA"),
    "ref": env.get("GITHUB_REF"),
    "run_id": env.get("GITHUB_RUN_ID"),
    "run_attempt": env.get("GITHUB_RUN_ATTEMPT"),
    "actor": env.get("GITHUB_ACTOR"),
    "workflow": env.get("GITHUB_WORKFLOW"),
    "recorded_at": datetime.datetime.utcnow().isoformat() + "Z",
    "runner": env.get("RUNNER_OS"),
    "artifacts": {},
}
if detail_file and os.path.exists(detail_file):
    record["artifacts"][os.path.basename(detail_file)] = digest(detail_file)

out = os.path.join(trace_dir, f"{name}-{env.get('GITHUB_RUN_ID','local')}.json")
with open(out, "w") as fh:
    json.dump(record, fh, indent=2)
print(f"trace written: {out}")
PY
}

# append_summary <markdown-file>
append_summary() {
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ] && [ -f "$1" ]; then
    cat "$1" >> "$GITHUB_STEP_SUMMARY"
  else
    cat "$1"
  fi
}
