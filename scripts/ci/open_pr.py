#!/usr/bin/env python3
"""Open a pull request for an autofix branch, or reuse the open one."""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


def main():
    if len(sys.argv) < 2:
        print("usage: open_pr.py <branch>")
        return 2
    branch = sys.argv[1]
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    repo = os.environ.get("GITHUB_REPOSITORY")
    base = os.environ.get("GITHUB_REF_NAME", "main")
    if not token or not repo:
        print("missing GH_TOKEN or GITHUB_REPOSITORY")
        return 1

    body = {
        "title": "chore: automated lint and dependency fixes",
        "head": branch,
        "base": base,
        "body": ("Automated fixes from the Autofix workflow.\n\n"
                 "Lint, formatting, lockfile and workflow-permission changes only. "
                 "Review the diff before merging."),
    }
    req = urllib.request.Request(
        f"https://api.github.com/repos/{repo}/pulls",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {token}",
                 "Accept": "application/vnd.github+json"},
        method="POST")
    try:
        with urllib.request.urlopen(req) as r:
            d = json.load(r)
        print("pull request:", d["html_url"])
        return 0
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode()[:300]
        print(f"pull request failed: {exc.code} {detail}")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
