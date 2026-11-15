import { CipherTubeClient } from "../src";

async function runClientVerification() {
  console.log("Initializing Cipher-Tube TypeScript SDK Client...");

  const client = new CipherTubeClient({
    environment: "http://localhost:8000",
    token: "cipher-tube-local-token-806"
  });

  const sampleRequest = {
    assetPayload: "R2VucmEgVHdpc3RlZCBTeXJ1cCBTdHJlYW0gUGF5bG9hZCA4MDY=",
    manifestStore: {
      manifestId: "urn:uuid:cipher-tube-ts-client-806",
      jumbfData: "eyJ0aXRsZSI6ICJDaXBoZXItVHViZSBTZWN1cmUgTWFuaWZlc3QifQ==",
      version: "1.0.0"
    },
    hardBindings: [
      {
        hashAlgorithm: "c2pa.hash.data",
        digest: "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0",
        targetUri: "cipher-tube://asset/806-client-test"
      }
    ],
    claimSignature: {
      signerId: "ightevenmckane187-authority",
      signatureValue: "mock-signature-hash-value-806",
      certificateChain: ["-----BEGIN CERTIFICATE-----\nMOCK-ROOT\n-----END CERTIFICATE-----"],
      timestamp: new Date().toISOString()
    }
  };

  try {
    console.log("Submitting C2PA verification request via TypeScript SDK...");
    const response = await client.c2paVerification.verifyManifest(sampleRequest);
    console.log("Verification Successful! Response received:", JSON.stringify(response, null, 2));
  } catch (error: any) {
    console.error("Verification failed or error caught:", error.message || error);
  }
}

if (require.main === module) {
  runClientVerification();
}
