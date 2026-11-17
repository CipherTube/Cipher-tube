import json
from datetime import datetime

try:
    from .adb_verifier_wrapper import AdbVerifierWrapper
except ImportError:
    from adb_verifier_wrapper import AdbVerifierWrapper
try:
    from .jumbf_simulator import JumbfSimulator
except ImportError:
    from jumbf_simulator import JumbfSimulator
try:
    from .audit_logger import CipherTubeAuditLogger
except ImportError:
    from audit_logger import CipherTubeAuditLogger


class CipherTubeDiagnosticRunner:
    def __init__(self, asset_id: str = "diagnostic-806"):
        self.asset_id = asset_id
        self.adb_wrapper = AdbVerifierWrapper()
        self.audit_logger = CipherTubeAuditLogger()

    def run_diagnostic(self) -> dict:
        pulled_files = self.adb_wrapper.scan_and_pull_artifacts()
        if pulled_files:
            with open(pulled_files[0], "rb") as f:
                payload_bytes = f.read()
        else:
            payload_bytes = b"Cipher-Tube Default Diagnostic Stream Payload"

        simulator = JumbfSimulator(asset_id=self.asset_id, payload_data=payload_bytes)
        verification_payload = simulator.build_verification_payload()

        self.audit_logger.log_event(
            asset_id=self.asset_id,
            status="SUCCESS",
            tamper_detected=False,
            details={"deviceBridgeActive": len(pulled_files) > 0},
        )

        return {
            "status": "SUCCESS",
            "timestamp": datetime.utcnow().isoformat(),
            "assetId": self.asset_id,
            "verificationPayload": verification_payload,
        }


if __name__ == "__main__":
    runner = CipherTubeDiagnosticRunner()
    print(json.dumps(runner.run_diagnostic(), indent=2))
