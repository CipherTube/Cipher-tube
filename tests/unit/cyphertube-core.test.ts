import { describe, it, expect, vi, beforeAll } from "vitest";
import crypto from "crypto";

// 1. Setup global mocks for Canvas Blinder
const mockGetImageData = vi.fn().mockReturnValue({
  data: new Uint8Array([100, 150, 200, 255]),
});

const mockToDataURL = vi.fn().mockReturnValue("data:image/png;base64,poisoned");

class MockCanvasRenderingContext2D {
  getImageData(x: number, y: number, w: number, h: number) {
    return mockGetImageData(x, y, w, h);
  }
}

class MockHTMLCanvasElement {
  width = 100;
  height = 100;
  getContext(type: string) {
    if (type === "2d") return new MockCanvasRenderingContext2D();
    return null;
  }
  toDataURL(...args: any[]) {
    return mockToDataURL(...args);
  }
}

class MockWebGLRenderingContext {
  getParameter(pname: number) {
    return pname === 0x9245 ? "Standard WebGL" : "Other";
  }
  readPixels(
    x: any,
    y: any,
    w: any,
    h: any,
    format: any,
    type: any,
    pixels: Uint8Array,
  ) {
    pixels.fill(128);
  }
}

class MockWebGL2RenderingContext {
  getParameter(pname: number) {
    return pname === 0x9245 ? "Standard WebGL" : "Other";
  }
  readPixels(
    x: any,
    y: any,
    w: any,
    h: any,
    format: any,
    type: any,
    pixels: Uint8Array,
  ) {
    pixels.fill(128);
  }
}

// Import other classes statically
import { ZkLoadBalancer } from "../../cyphertube-core/src/client/zk_load_balancer.js";
import { ClientManifestVerifier } from "../../cyphertube-core/src/client/client_manifest_verifier.js";
import { PlaylistMetadataStore } from "../../cyphertube-core/src/client/playlist_metadata_store.js";
import { BlindQuotaManager } from "../../cyphertube-core/src/node/blind_quota_manager.js";
import { ZkSignalingRing } from "../../cyphertube-core/src/node/zk_signaling_ring.js";

describe("CypherTube Sovereign, Zero-Knowledge P2P Streaming Engine Core", () => {
  beforeAll(async () => {
    // Attach distinct mocks to globalThis before dynamically importing canvas_blinder
    (globalThis as any).CanvasRenderingContext2D = MockCanvasRenderingContext2D;
    (globalThis as any).HTMLCanvasElement = MockHTMLCanvasElement;
    (globalThis as any).WebGLRenderingContext = MockWebGLRenderingContext;
    (globalThis as any).WebGL2RenderingContext = MockWebGL2RenderingContext;

    // Dynamic import prevents ESM hoisting issues so globals are mocked first
    await import("../../cyphertube-core/src/client/canvas_blinder.js");
  });

  describe("Layer 0: Browser/GPU Fingerprint Invalidation (CanvasBlinder)", () => {
    it("should intercept and poison image data pixels from Canvas 2D", () => {
      // Stub getRandomValues to provide deterministic +1 shift
      const originalGetRandomValues = globalThis.crypto.getRandomValues;
      globalThis.crypto.getRandomValues = vi.fn().mockImplementation((arr) => {
        arr[0] = 2; // (2 % 3) - 1 = +1
        return arr;
      });

      try {
        const ctx = new (globalThis as any).CanvasRenderingContext2D();
        const imgData = ctx.getImageData(0, 0, 1, 1);

        expect(imgData.data[0]).toBe(101);
        expect(imgData.data[1]).toBe(151);
        expect(imgData.data[2]).toBe(201);
        expect(imgData.data[3]).toBe(255); // Transparency skipped
      } finally {
        globalThis.crypto.getRandomValues = originalGetRandomValues;
      }
    });

    it("should intercept and poison WebGL parameters and pixel reads", () => {
      const originalGetRandomValues = globalThis.crypto.getRandomValues;
      globalThis.crypto.getRandomValues = vi.fn().mockImplementation((arr) => {
        arr[0] = 2; // (2 % 3) - 1 = +1
        return arr;
      });

      try {
        const gl = new (globalThis as any).WebGLRenderingContext();
        expect(gl.getParameter(0x9245)).toBe("Sovereign WebGL Engine");
        expect(gl.getParameter(0x9246)).toBe("CypherTube OpenCore Project");

        const pixels = new Uint8Array(4);
        gl.readPixels(0, 0, 1, 1, 0, 0, pixels);
        expect(pixels[0]).toBe(129);
      } finally {
        globalThis.crypto.getRandomValues = originalGetRandomValues;
      }
    });
  });

  describe("Layer 1: Telemetry-Blind Client Routing (ZkLoadBalancer)", () => {
    it("should track latency with EWMA and compute weight scores", () => {
      const registry = new Map([
        ["peer-1", { status: "ACTIVE", score: 90 }],
        ["peer-2", { status: "ACTIVE", score: 50 }],
      ]);

      const balancer = new ZkLoadBalancer(registry);

      // Record some latencies
      balancer.recordLatency("peer-1", 100);
      balancer.recordLatency("peer-1", 80);
      balancer.recordLatency("peer-2", 400);

      // Verify SRTT calculations (default srtt: 200, ALPHA: 0.125)
      // peer-1 first: 200 * 0.875 + 100 * 0.125 = 175 + 12.5 = 187.5
      // peer-1 second: 187.5 * 0.875 + 80 * 0.125 = 164.0625 + 10 = 174.0625
      const metrics1 = (balancer as any).metrics.get("peer-1");
      expect(metrics1.srtt).toBeCloseTo(174.0625);

      // Record some transmission failures
      balancer.recordTransmissionEvent("peer-2", true);
      const metrics2 = (balancer as any).metrics.get("peer-2");
      expect(metrics2.errorRate).toBe(0.25); // BETA = 0.25, 0 * 0.75 + 1 * 0.25

      // Check active inflights
      balancer.incrementInFlight("peer-1");
      expect(metrics1.activeRequests).toBe(1);
      balancer.decrementInFlight("peer-1");
      expect(metrics1.activeRequests).toBe(0);
    });

    it("should select optimal peer based on cost and score weights", () => {
      const registry = new Map([
        ["peer-1", { status: "ACTIVE", score: 100 }],
        ["peer-2", { status: "INACTIVE", score: 100 }],
      ]);

      const balancer = new ZkLoadBalancer(registry);
      const peer = balancer.selectOptimalPeer(["peer-1", "peer-2"]);
      expect(peer).toBe("peer-1"); // peer-2 is inactive
    });
  });

  describe("Layer 2: Short-Lived Ephemeral Trust Validation (ClientManifestVerifier)", () => {
    let verifier: ClientManifestVerifier;
    let nodeKeyPair: {
      publicKey: crypto.KeyObject;
      privateKey: crypto.KeyObject;
    };
    let opKeyPair: {
      publicKey: crypto.KeyObject;
      privateKey: crypto.KeyObject;
    };

    beforeAll(() => {
      verifier = new ClientManifestVerifier();
      nodeKeyPair = crypto.generateKeyPairSync("ed25519");
      opKeyPair = crypto.generateKeyPairSync("ed25519");
    });

    it("should register trusted nodes and verify signed manifests", () => {
      const nodeDid = "did:ctube:node-1";
      const kNodePubKeyDER = nodeKeyPair.publicKey.export({
        type: "spki",
        format: "der",
      });
      verifier.registerTrustedNode(nodeDid, kNodePubKeyDER);

      const opPubKeyHex = opKeyPair.publicKey
        .export({ type: "spki", format: "der" })
        .toString("hex");
      const expiry = Math.floor(Date.now() / 1000) + 3600;

      // Sign delegation token
      const serializedDelegation = JSON.stringify({
        pubKey: opPubKeyHex,
        expiry,
      });
      const delegationSig = crypto.sign(
        null,
        Buffer.from(serializedDelegation),
        nodeKeyPair.privateKey,
      );

      const delegationToken = {
        op_public_key: opPubKeyHex,
        valid_until_epoch: expiry,
        issuer_node_did: nodeDid,
        delegation_signature: delegationSig.toString("hex"),
      };

      // Sign manifest
      const canonicalBlindId = "blind-id-123";
      const segmentIndex = 0;
      const cryptoMetadata = { algo: "AES-GCM" };
      const serializedManifest = JSON.stringify({
        blindId: canonicalBlindId,
        idx: segmentIndex,
        meta: cryptoMetadata,
      });
      const manifestSig = crypto.sign(
        null,
        Buffer.from(serializedManifest),
        opKeyPair.privateKey,
      );

      const manifest = {
        delegation_token: delegationToken,
        manifest_signature: manifestSig.toString("hex"),
        canonical_blind_id: canonicalBlindId,
        segment_index: segmentIndex,
        crypto_metadata: cryptoMetadata,
      };

      const result = verifier.verifyManifest(manifest);
      expect(result).toBe(true);
    });

    it("should reject malformed or typed-mismatched manifests/delegations", () => {
      expect(() => verifier.verifyManifest(null as any)).toThrow("Manifest must be a valid non-null object.");
      expect(() => verifier.verifyManifest({} as any)).toThrow("Delegation token must be a valid non-null object.");

      const invalidFieldsManifest = {
        delegation_token: {
          op_public_key: 123 as any,
          valid_until_epoch: 1000,
          issuer_node_did: "node",
          delegation_signature: "sig",
        },
        manifest_signature: "sig",
        canonical_blind_id: "blind",
        segment_index: 0,
      };
      expect(() => verifier.verifyManifest(invalidFieldsManifest as any)).toThrow("Invalid manifest field types.");

      const invalidEpochManifest = {
        delegation_token: {
          op_public_key: "key",
          valid_until_epoch: "not-a-number" as any,
          issuer_node_did: "node",
          delegation_signature: "sig",
        },
        manifest_signature: "sig",
        canonical_blind_id: "blind",
        segment_index: 0,
      };
      expect(() => verifier.verifyManifest(invalidEpochManifest as any)).toThrow("Invalid valid_until_epoch.");

      const invalidSegmentIndexManifest = {
        delegation_token: {
          op_public_key: "key",
          valid_until_epoch: 10000,
          issuer_node_did: "node",
          delegation_signature: "sig",
        },
        manifest_signature: "sig",
        canonical_blind_id: "blind",
        segment_index: NaN,
      };
      expect(() => verifier.verifyManifest(invalidSegmentIndexManifest as any)).toThrow("Invalid segment_index.");
    });

    it("should reject manifest if signing key is revoked via revocation tickets", () => {
      const opPubKeyHex = opKeyPair.publicKey
        .export({ type: "spki", format: "der" })
        .toString("hex");
      const ticket = {
        revocation_target: opPubKeyHex,
        revocation_epoch: Math.floor(Date.now() / 1000),
        reason_code: "KEY_COMPROMISE",
        issuer_node_did: "did:ctube:node-1",
        revocation_signature: "",
      };

      // Sign revocation ticket
      const serialized = JSON.stringify({
        target: ticket.revocation_target,
        epoch: ticket.revocation_epoch,
        reason: ticket.reason_code,
      });
      ticket.revocation_signature = crypto
        .sign(null, Buffer.from(serialized), nodeKeyPair.privateKey)
        .toString("hex");

      verifier.ingestRevocationTicket(ticket);

      const expiredManifest = {
        delegation_token: {
          op_public_key: opPubKeyHex,
          valid_until_epoch: Math.floor(Date.now() / 1000) + 1000,
          issuer_node_did: "did:ctube:node-1",
          delegation_signature: "",
        },
        manifest_signature: "",
        canonical_blind_id: "blind-id-123",
        segment_index: 0,
        crypto_metadata: {},
      };

      expect(() => verifier.verifyManifest(expiredManifest)).toThrow("revoked");
    });

    it("should reject malformed or oversized revocation tickets in ingestRevocationTicket", () => {
      // 1. null ticket
      expect(() => verifier.ingestRevocationTicket(null as any)).toThrow(
        "REVOCATION_VERIFY_ERR: Ticket must be a valid non-null object."
      );

      // 2. non-string / incorrect field types
      const badTicketTypes = {
        revocation_target: 123 as any,
        revocation_epoch: Math.floor(Date.now() / 1000),
        reason_code: "KEY_COMPROMISE",
        issuer_node_did: "did:ctube:node-1",
        revocation_signature: "",
      };
      expect(() => verifier.ingestRevocationTicket(badTicketTypes)).toThrow(
        "REVOCATION_VERIFY_ERR: Invalid field types."
      );

      // 3. invalid epoch type or value
      const badEpochTicket = {
        revocation_target: "target",
        revocation_epoch: "not-a-number" as any,
        reason_code: "KEY_COMPROMISE",
        issuer_node_did: "did:ctube:node-1",
        revocation_signature: "",
      };
      expect(() => verifier.ingestRevocationTicket(badEpochTicket)).toThrow(
        "REVOCATION_VERIFY_ERR: Invalid revocation_epoch."
      );

      // 4. oversized fields
      const oversizedTicket = {
        revocation_target: "a".repeat(1025),
        revocation_epoch: Math.floor(Date.now() / 1000),
        reason_code: "KEY_COMPROMISE",
        issuer_node_did: "did:ctube:node-1",
        revocation_signature: "",
      };
      expect(() => verifier.ingestRevocationTicket(oversizedTicket)).toThrow(
        "REVOCATION_VERIFY_ERR: Field exceeds maximum length limit."
      );
    });
  });

  describe("Layer 3: End-to-End Encrypted Group CRDT Storage (PlaylistMetadataStore)", () => {
    let mockCryptoCore: any;
    let store: PlaylistMetadataStore;
    let aesKey: crypto.webcrypto.CryptoKey;

    beforeAll(async () => {
      aesKey = await globalThis.crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"],
      );

      mockCryptoCore = {
        asymmetricDecrypt: vi.fn().mockResolvedValue(aesKey),
      };

      store = new PlaylistMetadataStore(mockCryptoCore, "did:ctube:user-1");
    });

    it("should derive blind metadata ID", async () => {
      const blindId = await store.deriveBlindMetaId("playlist-123");
      expect(blindId).toHaveLength(64); // SHA-256 hex length
    });

    it("should decrypt key envelope and store symmetric key", async () => {
      const blindId = "blind-id-1";
      const envelopes = [
        {
          recipient_did: "did:ctube:user-1",
          encrypted_key_blob: "blob",
          iv: "iv",
        },
      ];

      const key = await store.decryptKeyEnvelope(
        blindId,
        envelopes,
        "privateKeyRaw",
      );
      expect(key).toBe(aesKey);
      expect((store as any).resolvedKeys.get(blindId)).toBe(aesKey);
    });

    it("should merge CRDT states with LWW-Element-Sets and timestamps", () => {
      const localDoc = {
        playlist_id: "p-1",
        owner_did: "did:ctube:user-1",
        members: ["did:ctube:user-1"],
        ops_log: [
          {
            type: "ADD",
            op_id: "op-1",
            canonical_blind_id: "b-1",
            timestamp: 100,
          },
        ],
      };

      const incomingDoc = {
        playlist_id: "p-1",
        owner_did: "did:ctube:user-1",
        members: ["did:ctube:user-1", "did:ctube:user-2"],
        ops_log: [
          {
            type: "REMOVE",
            op_id: "op-2",
            target_op_id: "op-1",
            timestamp: 150,
          },
        ],
      };

      const consolidated = store.mergeCrdtStates(localDoc, incomingDoc);
      expect(consolidated.members).toContain("did:ctube:user-2");
      const entry = consolidated.entries.get("op-1");
      expect(entry?.tombstone).toBe(true); // Removed by later timestamp operation
    });

    it("should seal metadata documents with AES-GCM", async () => {
      const blindId = "blind-id-1";
      (store as any).resolvedKeys.set(blindId, aesKey);

      const doc = {
        playlist_id: "p-1",
        owner_did: "did:ctube:user-1",
        members: ["did:ctube:user-1"],
        ops_log: [],
      };

      const sealed = await store.sealMetadataDocument(blindId, doc);
      expect(sealed.canonical_blind_id_meta).toBe(blindId);
      expect(sealed.encrypted_payload).toBeDefined();
      expect(sealed.crypto_metadata.iv).toBeDefined();
    });
  });

  describe("Layer 4: Anonymous Resource & DoS Protection (BlindQuotaManager)", () => {
    let mockDb: any;
    let mockStorage: any;
    let quotaManager: BlindQuotaManager;

    beforeAll(() => {
      mockDb = {
        collection: vi.fn().mockReturnValue({
          findOne: vi.fn().mockResolvedValue({ allocated_bytes: 1000 }),
          aggregate: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue([{ total: 1000 }]),
          }),
          updateOne: vi.fn().mockResolvedValue({}),
          insertOne: vi.fn().mockResolvedValue({}),
          find: vi.fn().mockReturnValue({
            sort: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                toArray: vi
                  .fn()
                  .mockResolvedValue([{ canonical_blind_id: "b-1" }]),
              }),
            }),
          }),
          deleteOne: vi.fn().mockResolvedValue({}),
        }),
      };

      mockStorage = {
        bucketName: "test-bucket",
        minio: {
          removeObject: vi.fn().mockResolvedValue(true),
        },
      };

      quotaManager = new BlindQuotaManager(mockDb, mockStorage, {
        maxPipelineQuotaBytes: 5000,
        nodeMaxCapacityBytes: 10000,
      });
    });

    it("should validate capacity and quota thresholds", async () => {
      const isValid = await quotaManager.validateQuotaWindow("blind-1", 500);
      expect(isValid).toBe(true);
    });

    it("should register storage ingress", async () => {
      await quotaManager.registerStorageIngress("blind-1", 1, 500);
      expect(mockDb.collection).toHaveBeenCalledWith("storage_ledger");
      expect(mockDb.collection).toHaveBeenCalledWith("blind_block_manifest");
    });

    it("should trigger emergency compaction if capacity limit is reached", async () => {
      // Set usage to hit capacity limit
      mockDb.collection.mockReturnValueOnce({
        aggregate: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([{ total: 9900 }]), // Close to 10000 capacity
        }),
      });

      await expect(
        quotaManager.validateQuotaWindow("blind-1", 500),
      ).rejects.toThrow("NODE_STORAGE_CRITICAL");
      // Emergency compaction triggered asynchronously
      expect(mockStorage.minio.removeObject).toHaveBeenCalled();
    });
  });

  describe("Layer 5: Dynamic Live Stream Failover Circuit (ZkSignalingRing)", () => {
    let mockDb: any;
    let ring: ZkSignalingRing;

    beforeAll(() => {
      mockDb = {
        collection: vi.fn().mockReturnValue({
          updateOne: vi.fn().mockResolvedValue({}),
        }),
      };

      // Ed25519 raw private key or standard
      const keyPair = crypto.generateKeyPairSync("ed25519");
      ring = new ZkSignalingRing(
        keyPair.privateKey,
        "did:ctube:node-1",
        mockDb,
      );
    });

    it("should initialize live signaling ring topology loops", async () => {
      const orderedDids = [
        "did:ctube:node-1",
        "did:ctube:node-2",
        "did:ctube:node-3",
      ];
      const { currentWindowId, nextPeerDid } = await ring.initializeLiveRing(
        "stream-1",
        orderedDids,
      );

      expect(currentWindowId).toBeDefined();
      expect(nextPeerDid).toBe("did:ctube:node-2"); // Next peer in the ring loop
    });

    it("should dispatch transitions and sign frame state transitions", async () => {
      // Mock network forward
      const mockForward = vi
        .spyOn(ring as any, "_forwardToNetworkPeer")
        .mockResolvedValue(undefined);

      await ring.dispatchTransition("stream-1", "LIVE_ACTIVE", {
        bitrate: 4000,
      });
      expect(mockForward).toHaveBeenCalled();
    });

    it("should handle incoming signals and execute failover routing transitions", async () => {
      const orderedDids = [
        "did:ctube:node-1",
        "did:ctube:node-2",
        "did:ctube:node-3",
      ];
      const { currentWindowId } = await ring.initializeLiveRing(
        "stream-1",
        orderedDids,
      );

      const ringCtx = (ring as any).activeRings.get(currentWindowId);

      const framePayload = {
        w: currentWindowId,
        s: "LIVE_FAILOVER",
        p: {},
        t: Math.floor(Date.now() / 1000),
      };
      const serialized = JSON.stringify(framePayload);
      const signature = crypto.sign(
        null,
        Buffer.from(serialized),
        ringCtx.opPrivateKey,
      );

      const packet = {
        senderDid: "did:ctube:node-3",
        windowId: currentWindowId,
        frame: serialized,
        signature: signature.toString("hex"),
      };

      const mockCol = { updateOne: vi.fn() };
      (ring as any).db = mockCol;

      await ring.handleIncomingSignal(packet);
      expect(mockCol.updateOne).toHaveBeenCalledWith(
        { stream_window: currentWindowId },
        { $set: { routing_status: "FAILOVER_ACTIVE" } },
        { upsert: true },
      );
    });
  });
});
