# Signing & Release Setup Guide

Everything you need on your side to produce signed CypherTube artifacts via `ci-workflows/release.yml`. Time estimates: Android ~10 min (free), macOS ~1 day incl. Apple enrollment ($99/yr), Windows optional.

---

## 1. Android release keystore (free, ~10 minutes)

You need a JDK installed (`keytool` ships with it). On any machine:

```bash
keytool -genkeypair -v \
  -keystore ciphertube-release.keystore \
  -alias ciphertube \
  -keyalg RSA -keysize 4096 \
  -validity 10000 \
  -storetype PKCS12
```

- When prompted, set a **strong keystore password** and enter your org details (name, org unit, city, state, country code). PKCS12 uses the same password for store and key.
- **Back this file up somewhere safe** (password manager attachment + offline copy). The keystore is the app's identity — losing it means you can never update the same APK identity.

Base64-encode it for GitHub:

```bash
# macOS
base64 -i ciphertube-release.keystore -o ciphertube-release.keystore.b64
# Linux
base64 -w 0 ciphertube-release.keystore > ciphertube-release.keystore.b64
# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("ciphertube-release.keystore")) | Set-Content ciphertube-release.keystore.b64
```

Add these **repository secrets** (Settings → Secrets and variables → Actions → Secrets):

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | contents of the `.b64` file |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
| `ANDROID_KEY_ALIAS` | `ciphertube` |
| `ANDROID_KEY_PASSWORD` | same as the keystore password (PKCS12) |

---

## 2. macOS signing + notarization ($99/yr, ~1 day)

1. **Enroll** in the Apple Developer Program: developer.apple.com/programs → individual enrollment works; organization enrollment needs a DUNS number.
2. Once enrolled: **Certificates, Identifiers & Profiles → Certificates → + → Developer ID Application** (this is the cert type for apps distributed *outside* the App Store — that's us).
3. Follow the CSR flow: on a Mac, Keychain Access → Certificate Assistant → Request a Certificate from a Certificate Authority → save the `.certSigningRequest` → upload it → download the issued `.cer` (Keychain installs it automatically).
4. In Keychain Access, select the new "Developer ID Application" cert **plus** its private key → Export 2 items → `.p12` → set an export password.
5. Base64 the `.p12`: `base64 -i developer-id.p12 -o developer-id.p12.b64`
6. **App-specific password** (for notarization): appleid.apple.com → Sign-In and Security → App-Specific Passwords → generate one, label it "notarization".
7. **Team ID**: Membership page, the 10-character Team ID.

Add these secrets:

| Secret | Value |
|---|---|
| `MAC_CERT_BASE64` | contents of `developer-id.p12.b64` |
| `MAC_CERT_PASSWORD` | the `.p12` export password |
| `APPLE_ID` | your Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | the app-specific password from step 6 |
| `APPLE_TEAM_ID` | the 10-char Team ID |

electron-builder handles the rest (signing + `notarytool` notarization + stapling) automatically.

---

## 3. Windows (optional for beta)

Unsigned NSIS installers build fine — users see a SmartScreen warning. When you're ready for signed installers: buy an OV code-signing certificate from a CA (DigiCert/Sectigo, ~$100–300/yr), export as `.pfx`, then set `WIN_CERT_BASE64` / `WIN_CERT_PASSWORD` style secrets and extend `release.yml`'s win env block. EV certs remove SmartScreen immediately but are hardware-token bound.

---

## 4. Production gateway TLS cert (free via Let's Encrypt)

The desktop and Android clients connect to the gateway over HTTPS with `rejectUnauthorized` on — so production needs a valid cert, not a self-signed one. Easiest: put Caddy (automatic Let's Encrypt) in front of the gateway, or use certbot with any web server. Domain required (e.g., `gateway.yourdomain.com`).

**Optional — bake the cert pin into desktop builds:**

```bash
echo | openssl s_client -connect gateway.yourdomain.com:443 -servername gateway.yourdomain.com 2>/dev/null \
  | openssl x509 -outform DER | openssl dgst -sha256
# output: sha256(stdin)= abc123...  ← that hex is CIPHERTUBE_CERT_PIN
```

Add `CIPHERTUBE_CERT_PIN` as a secret (rotate it when you rotate the gateway cert), and `CIPHERTUBE_GATEWAY_URL` (e.g. `https://gateway.yourdomain.com`) as a **repository variable** (same Settings page, Variables tab).

---

## 5. One-time workflow activation + first release

The API connector can't write `.github/workflows/`, so once, via the GitHub web UI:

1. Open `ci-workflows/ci-build.yml` in the repo → copy contents → Add file → Create new file → name it `.github/workflows/ci-build.yml` → paste → Commit.
2. Repeat for `ci-workflows/release.yml` → `.github/workflows/release.yml`.

Then tag the first release (Releases → Draft a new release → type `v1.6.0-beta.1` as a new tag → Publish). `release.yml` fires: signed APK, signed+notarized macOS dmg, Windows/Linux installers, all attached to the GitHub Release automatically.

**Sanity check before tagging:** with no Apple secrets set, the mac build would still produce an unsigned artifact — but for a *signed* beta make sure all 5 Apple secrets + 4 Android secrets exist first. The Actions run log will name anything missing.
