import json

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


class CrossPlatformSimulatorRunner:
    def __init__(self, asset_id: str = "cross-platform-806"):
        self.asset_id = asset_id
        self.adb_wrapper = AdbVerifierWrapper()
        self.audit_logger = CipherTubeAuditLogger()

    def execute_pipeline(self):
        device_active = self.adb_wrapper.check_connection()
        pulled_artifacts = (
            self.adb_wrapper.scan_and_pull_artifacts() if device_active else []
        )
        payload_data = b"Cipher-Tube Mobile Integration Stream Payload"

        simulator = JumbfSimulator(asset_id=self.asset_id, payload_data=payload_data)
        verification_payload = simulator.build_verification_payload()

        audit_event = self.audit_logger.log_event(
            asset_id=self.asset_id,
            status="SUCCESS",
            tamper_detected=False,
            details={
                "mobileDeviceConnected": device_active,
                "artifactsPulledCount": len(pulled_artifacts),
            },
        )

        print(json.dumps(audit_event, indent=2))


if __name__ == "__main__":
    runner = CrossPlatformSimulatorRunner()
    runner.execute_pipeline()
