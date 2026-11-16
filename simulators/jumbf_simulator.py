import base64
import hashlib
import json
from datetime import datetime


class JumbfSimulator:
    def __init__(self, asset_id: str, payload_data: bytes):
        self.asset_id = asset_id
        self.payload_data = payload_data

    def compute_hard_binding(self) -> str:
        """Computes a SHA-256 digest representing c2pa.hash.data hard binding."""
        return hashlib.sha256(self.payload_data).hexdigest()

    def build_verification_payload(self) -> dict:
        digest = self.compute_hard_binding()
        manifest = {
            "title": f"Cipher-Tube Manifest {self.asset_id}",
            "created": datetime.utcnow().isoformat(),
        }

        return {
            "assetPayload": base64.b64encode(self.payload_data).decode("utf-8"),
            "manifestStore": {
                "manifestId": f"urn:uuid:{self.asset_id}",
                "jumbfData": base64.b64encode(
                    json.dumps(manifest).encode("utf-8")
                ).decode("utf-8"),
                "version": "1.0.0",
            },
            "hardBindings": [
                {
                    "hashAlgorithm": "c2pa.hash.data",
                    "digest": digest,
                    "targetUri": f"cipher-tube://asset/{self.asset_id}",
                }
            ],
            "claimSignature": {
                "signerId": "ightevenmckane187-authority",
                "signatureValue": hashlib.sha256(
                    (digest + self.asset_id).encode("utf-8")
                ).hexdigest(),
                "certificateChain": [
                    "-----BEGIN CERTIFICATE-----\nMOCK-ROOT-CERT\n-----END CERTIFICATE-----"
                ],
                "timestamp": datetime.utcnow().isoformat(),
            },
        }
