# Sovereign OS dashboards

Two standalone, client-side simulations. Open either file in a browser. No build, no server.

| File | What it models | Defaults |
|---|---|---|
| `throughput-simulator.html` | Zero-trust multi-agent throughput with a token bucket, 429 retry and 403 intrusion blocking | 14 req/s in, 16/s refill, 20-token burst, 4 agents |
| `stress-test-dashboard.html` | Heavier stress harness with scenario presets (normal, burst spike, intrusion, backoff recovery) | 250 req/s in, 320/s refill, 400-token burst, 8 to 16 workers |

## What they are not

They are **simulations**. They make no network calls and send nothing anywhere. The numbers on screen come from a deterministic in-page model, not from the Optimus stack in `src/optimus/`. Use them to reason about rate-limit shape, not to measure real throughput.

The displayed Fern definitions are illustrative. The real spec is `fern/definition/api.yml`.

## Third-party dependency

Both load Tailwind from `cdn.tailwindcss.com` and fonts from Google Fonts. That conflicts with a no-third-party goal. Offline, they render unstyled. To self-host, build Tailwind into a static CSS file and vendor the two fonts, then remove the CDN tags.

## Safety check

Neither file uses `eval`, `new Function`, storage, or network calls. The only `innerHTML` writes render log rows built from the file's own constants and numeric state, so no outside string reaches them.
