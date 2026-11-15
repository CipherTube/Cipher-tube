#!/usr/bin/env python3
"""Report or add a least-privilege permissions block on workflows that lack one.

    normalise_permissions.py --check   report only, never writes
    normalise_permissions.py           add the block

Autofix uses --check on purpose: a bot must not silently rewrite CI permissions,
and the Actions token is not allowed to push workflow changes anyway.
"""
from __future__ import annotations

import os
import re

ROOT = os.path.join(".github", "workflows")


def main(argv):
    check_only = "--check" in argv
    if not os.path.isdir(ROOT):
        print("no workflow directory")
        return 0

    changed, already, skipped = [], [], []
    for name in sorted(os.listdir(ROOT)):
        if not name.endswith((".yml", ".yaml")):
            continue
        path = os.path.join(ROOT, name)
        src = open(path).read()
        if re.search(r"^permissions:", src, re.M):
            already.append(name)
            continue
        m = re.search(r"^jobs:", src, re.M)
        if not m:
            skipped.append(name)
            continue
        if check_only:
            changed.append(name)
            continue
        block = "permissions:\n  contents: read\n\n"
        open(path, "w").write(src[:m.start()] + block + src[m.start():])
        changed.append(name)

    verb = "would add" if check_only else "added"
    print(f"permissions {verb}: {changed or 'nothing'}")
    print(f"already set: {already or 'nothing'}")
    if skipped:
        print(f"skipped, no jobs block: {skipped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(__import__("sys").argv))
