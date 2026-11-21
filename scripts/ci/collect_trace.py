#!/usr/bin/env python3
"""Build a trace record for a commit from GitHub run history.

Writes trace.json with every pipeline stage that ran against this commit,
its conclusion, its duration, and a hash over the record so the file can be
compared later without trusting the storage it sits in.
"""

from __future__ import annotations

import datetime
import hashlib
import json
import os
import urllib.error
import urllib.request

WANTED = (
    "Analysis",
    "Scanners",
    "Autofix",
    "CipherTube CI",
    "Code Coverage",
    "Build Container",
    "Container Job",
    "Build and Store Artifacts",
)


def api(url, token):
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
        },
    )
    with urllib.request.urlopen(req) as r:
        return json.load(r)


def duration(run):
    start, end = run.get("run_started_at"), run.get("updated_at")
    if not start or not end:
        return None
    try:
        a = datetime.datetime.fromisoformat(start.replace("Z", "+00:00"))
        b = datetime.datetime.fromisoformat(end.replace("Z", "+00:00"))
        return int((b - a).total_seconds())
    except Exception:
        return None


def main():
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    repo = os.environ.get("GITHUB_REPOSITORY")
    sha = os.environ.get("GITHUB_SHA", "")
    if not token or not repo:
        print("missing GH_TOKEN or GITHUB_REPOSITORY")
        return 1

    stages = {}
    try:
        runs = api(
            f"https://api.github.com/repos/{repo}/actions/runs?per_page=60", token
        )
        for r in runs.get("workflow_runs", []):
            if r.get("head_sha") != sha:
                continue
            name = r.get("name")
            if name not in WANTED or name in stages:
                continue
            stages[name] = {
                "conclusion": r.get("conclusion"),
                "run_id": r.get("id"),
                "duration_s": duration(r),
                "url": r.get("html_url"),
            }
    except urllib.error.HTTPError as exc:
        print(f"run history unavailable: {exc.code}")

    record = {
        "commit": sha,
        "short": sha[:7],
        "repo": repo,
        "ref": os.environ.get("GITHUB_REF"),
        "actor": os.environ.get("GITHUB_ACTOR"),
        "recorded_at": datetime.datetime.utcnow().isoformat() + "Z",
        "stages": stages,
        "missing_stages": [s for s in WANTED if s not in stages],
        "overall": "pass"
        if stages and all(v["conclusion"] == "success" for v in stages.values())
        else "review",
    }
    blob = json.dumps(record, sort_keys=True).encode()
    record["record_hash"] = hashlib.sha256(blob).hexdigest()

    with open("trace.json", "w") as fh:
        json.dump(record, fh, indent=2)

    print(
        f"commit {record['short']}  overall {record['overall']}  hash {record['record_hash'][:16]}"
    )
    for name, s in stages.items():
        print(f"  {name:26} {s['conclusion']!s:10} {s['duration_s']}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
