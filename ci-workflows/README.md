# CI Workflows (staging)

These are the build/release pipeline definitions for PLATFORM_SHIP_PLAN.md.

- `ci-build.yml` — build verification on every `desktop/**`, `ui/**`, `mobile/**` change: desktop (linux/mac/win, unsigned) + android debug APK
- `release.yml` — tag-triggered (`v1.6.0-*`) signed builds + GitHub Release publish

## Why they live here

The automated sync connector's GitHub token carries only `repo` scope; GitHub requires
the `workflow` scope to write files under `.github/workflows/` via the API (it 404s
without it). So these files are versioned here and need a **one-time manual activation**:

1. Open each file, copy its contents.
2. Create the same filename under `.github/workflows/` in the GitHub web UI
   (Add file → Create new file), paste, commit.
3. Delete nothing here — this copy stays the source of truth for review.

## Secrets to add (Settings → Secrets → Actions)

| Secret | Used by | Purpose |
|---|---|---|
| `ANDROID_KEYSTORE_BASE64` | release.yml | base64 of the release .keystore |
| `ANDROID_KEYSTORE_PASSWORD` | release.yml | keystore password |
| `ANDROID_KEY_ALIAS` | release.yml | signing key alias |
| `ANDROID_KEY_PASSWORD` | release.yml | key password |
| `MAC_CERT_BASE64` | release.yml | base64 .p12 (electron-builder `CSC_LINK`) |
| `MAC_CERT_PASSWORD` | release.yml | `CSC_KEY_PASSWORD` |
| `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` | release.yml | macOS notarization |
| `CIPHERTUBE_CERT_PIN` (optional) | release.yml | gateway leaf-cert SHA-256 baked into desktop builds |
| `CIPHERTUBE_GATEWAY_URL` (repo **variable**) | both | production gateway URL baked into builds |
