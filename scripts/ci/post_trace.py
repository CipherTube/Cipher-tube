#!/usr/bin/env python3
"""Post a trace record to the CipherTube agent hub ledger.

Silently does nothing when CI_HUB_URL or CI_HUB_KEY are not configured, so the
pipeline works with or without the hub.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request


def main():
    path = os.environ.get("TRACE_FILE", "trace.json")
    url = os.environ.get("CI_HUB_URL")
    key = os.environ.get("CI_HUB_KEY")
    if not (url and key):
        print("hub not configured, trace kept locally")
        return 0
    try:
        with open(path) as fh:
            d = json.load(fh)
    except OSError:
        print("no trace file")
        return 0

    stages = d.get("stages") or {}
    body = "; ".join(f"{k} {v.get('conclusion')}" for k, v in stages.items()) or "no stages recorded"
    payload = {
        "action": "post",
        "room": "ciphertube",
        "sender": "tracer",
        "recipient": "all",
        "kind": "note",
        "subject": f"[TRACE] {d.get('short', '')} {d.get('overall', '')}",
        "body": f"hash {d.get('record_hash', '')[:16]} | {body}",
        "meta": {"commit": d.get("commit"), "record_hash": d.get("record_hash")},
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"content-type": "application/json", "x-hub-key": key},
        method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            json.load(r)
        print("trace posted to hub ledger")
    except urllib.error.HTTPError as exc:
        print(f"hub rejected trace: {exc.code}")
    except Exception as exc:
        print(f"hub unreachable: {exc}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
