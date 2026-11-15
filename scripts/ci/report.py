#!/usr/bin/env python3
"""Turn scanner JSON into a readable summary, a markdown block, or a count.

Usage:
    report.py bandit  bandit.json            # human summary
    report.py gitleaks gitleaks.json --count # integer only
    report.py trivy   trivy.json --md out.md # markdown table row file
"""
from __future__ import annotations

import json
import os
import sys


def load(path):
    if not path or not os.path.exists(path):
        return None
    try:
        with open(path) as fh:
            return json.load(fh)
    except Exception:
        return None


def bandit(d):
    if d is None:
        return 0, ["bandit: no report"]
    rows = d.get("results", []) if isinstance(d, dict) else []
    lines = [f"bandit: {len(rows)} finding(s)"]
    for r in rows[:15]:
        lines.append(f"  {r.get('severity','?'):8} {r.get('test_id','?'):8} "
                     f"{r.get('filename','?')}:{r.get('line_number','?')} "
                     f"{str(r.get('issue_text',''))[:70]}")
    return len(rows), lines


def gitleaks(d):
    if d is None:
        return 0, ["gitleaks: no report"]
    rows = d if isinstance(d, list) else d.get("findings", [])
    lines = [f"gitleaks: {len(rows)} potential secret(s)"]
    for f in rows[:10]:
        lines.append(f"  {f.get('RuleID','?')} {f.get('File','?')}:{f.get('StartLine','?')}")
    return len(rows), lines


def trivy(d):
    if d is None:
        return 0, ["trivy: no report"]
    total = 0
    lines = []
    for r in d.get("Results", []) or []:
        for v in r.get("Vulnerabilities") or []:
            total += 1
            if total <= 10:
                lines.append(f"  VULN {v.get('Severity','?'):8} {v.get('VulnerabilityID','?')} "
                             f"{v.get('PkgName','?')} {v.get('InstalledVersion','?')}")
        for m in r.get("Misconfigurations") or []:
            total += 1
            if total <= 10:
                lines.append(f"  MISC {m.get('Severity','?'):8} {m.get('ID','?')} "
                             f"{str(m.get('Title',''))[:60]}")
    lines.insert(0, f"trivy: {total} finding(s) at HIGH or CRITICAL")
    return total, lines


def npm(d):
    if d is None:
        return 0, ["npm: no report"]
    meta = (d.get("metadata") or {}).get("vulnerabilities") or {}
    total = sum(v for k, v in meta.items() if k in ("high", "critical"))
    return total, [f"npm audit: {meta or 'no vulnerabilities'}"]


def pipaudit(d):
    if d is None:
        return 0, ["pip-audit: no report"]
    deps = d.get("dependencies", d) if isinstance(d, dict) else d
    total = 0
    lines = []
    if isinstance(deps, list):
        for dep in deps:
            vulns = dep.get("vulns") or []
            total += len(vulns)
            for v in vulns[:5]:
                lines.append(f"  {dep.get('name','?')} {dep.get('version','?')} -> "
                             f"{v.get('id','?')} fixed in {', '.join(v.get('fix_versions') or []) or 'no fix'}")
    lines.insert(0, f"pip-audit: {total} known vulnerable package(s)")
    return total, lines


HANDLERS = {
    "bandit": bandit,
    "gitleaks": gitleaks,
    "trivy": trivy,
    "npm": npm,
    "pip": pipaudit,
}


def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 2
    kind, path = argv[1], argv[2]
    handler = HANDLERS.get(kind)
    if not handler:
        print(f"unknown kind: {kind}", file=sys.stderr)
        return 2
    count, lines = handler(load(path))

    if "--count" in argv:
        print(count)
        return 0

    print("\n".join(lines))

    if "--md" in argv:
        out = argv[argv.index("--md") + 1]
        with open(out, "w") as fh:
            fh.write(f"| {kind} | {count} |\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
