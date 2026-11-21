#!/usr/bin/env python3
"""Print a trace record as an aligned plain-text block for the run summary."""

from __future__ import annotations

import json
import sys


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "trace.json"
    with open(path) as fh:
        d = json.load(fh)
    print(f"commit     {d.get('commit', '')[:12]}")
    print(f"repo       {d.get('repo', '')}")
    print(f"overall    {d.get('overall', '')}")
    print(f"hash       {d.get('record_hash', '')}")
    print(f"recorded   {d.get('recorded_at', '')}")
    print()
    print("stages")
    for name, s in (d.get("stages") or {}).items():
        print(f"  {name:26} {s.get('conclusion')!s:10} {s.get('duration_s')}s")
    missing = d.get("missing_stages") or []
    if missing:
        print()
        print("not run: " + ", ".join(missing))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
