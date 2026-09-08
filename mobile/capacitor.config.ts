import type { CapacitorConfig } from '@capacitor/cli';

// CypherTube Android client config - PLATFORM_SHIP_PLAN.md Phase 2
const config: CapacitorConfig = {
  appId: 'org.ciphertube.app',
  appName: 'CypherTube',
  webDir: 'www', // populated from ../ui/dist via `npx cap sync android`
  android: {
    allowMixedContent: false,
  },
};

export default config;
