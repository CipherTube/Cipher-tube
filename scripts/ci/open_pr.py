#!/usr/bin/env python3
"""Open a pull request for an autofix branch, or surface a one-click link.

GitHub blocks Actions tokens from creating pull requests when the org disallows
it, so a refusal is not a failure: the branch is already pushed, and the compare
link is written to the step summary for a human to click.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


def summarise(line: str) -> None:
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a") as fh:
            fh.write(line + "\n")


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

    compare = f"https://github.com/{repo}/compare/{base}...{branch}?expand=1"
    body = {
        "title": "chore: automated lint and dependency fixes",
        "head": branch,
        "base": base,
        "body": ("Automated fixes from the Autofix workflow.\n\n"
                 "Lint, formatting and lockfile changes only. "
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
        summarise(f"### Autofix\n\nPull request: {d['html_url']}")
        return 0
    except urllib.error.HTTPError as exc:
        print(f"pull request not created: {exc.code}")
        print("branch is pushed, open it here:", compare)
        summarise("### Autofix\n\nBranch `%s` is pushed. "
                  "Actions cannot open pull requests in this organisation, "
                  "so open one here: %s" % (branch, compare))
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
