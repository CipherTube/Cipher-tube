#!/usr/bin/env python3
"""Add a least-privilege permissions block to workflows that lack one."""
from __future__ import annotations

import os
import re

ROOT = os.path.join(".github", "workflows")


def main():
    if not os.path.isdir(ROOT):
        print("no workflow directory")
        return 0
    changed, skipped = [], []
    for name in sorted(os.listdir(ROOT)):
        if not name.endswith((".yml", ".yaml")):
            continue
        path = os.path.join(ROOT, name)
        src = open(path).read()
        if re.search(r"^permissions:", src, re.M):
            skipped.append(name)
            continue
        m = re.search(r"^jobs:", src, re.M)
        if not m:
            skipped.append(name)
            continue
        block = "permissions:\n  contents: read\n\n"
        src = src[:m.start()] + block + src[m.start():]
        open(path, "w").write(src)
        changed.append(name)
    print("permissions added:", changed or "nothing")
    print("already set:", skipped or "nothing")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
