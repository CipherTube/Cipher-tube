import type { CapacitorConfig } from '@capacitor/cli';

// CypherTube Android client config — PLATFORM_SHIP_PLAN.md Phase 2.
// When CIPHERTUBE_GATEWAY_URL is set (CI/production), the WebView renders
// the production gateway directly. Until the static SPA client lands in
// ui/dist, this is the distribution path for the APK track.
const gatewayUrl = process.env.CIPHERTUBE_GATEWAY_URL;

const config: CapacitorConfig = {
  appId: 'org.ciphertube.app',
  appName: 'CypherTube',
  webDir: 'www',
  ...(gatewayUrl ? { server: { url: gatewayUrl } } : {}),
  android: {
    allowMixedContent: false,
  },
};

export default config;
