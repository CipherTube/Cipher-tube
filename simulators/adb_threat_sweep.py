import json
import subprocess
from datetime import datetime

try:
    from .audit_logger import CipherTubeAuditLogger
except ImportError:
    from audit_logger import CipherTubeAuditLogger
try:
    from .webhook_dispatcher import CipherTubeWebhookDispatcher
except ImportError:
    from webhook_dispatcher import CipherTubeWebhookDispatcher


class AdbThreatSweep:
    def __init__(self, target_device_dir: str = "/sdcard/CipherTube/"):
        self.target_device_dir = target_device_dir
        self.audit_logger = CipherTubeAuditLogger()
        self.webhook_dispatcher = CipherTubeWebhookDispatcher()
        self.known_malicious_signatures = {
            "rogue_inject",
            "unauth_sidecar.jumbf",
            "malware_apk.apk",
            "exploit_payload",
        }

    def run_adb(self, cmd: list) -> str:
        res = subprocess.run(["adb"] + cmd, capture_output=True, text=True)
        if res.returncode != 0:
            raise RuntimeError(f"ADB command failed: {res.stderr.strip()}")
        return res.stdout.strip()

    def sweep_device(self) -> dict:
        try:
            devices_raw = self.run_adb(["devices"])
            active_devices = [l for l in devices_raw.splitlines() if "\tdevice" in l]
            if not active_devices:
                return {
                    "status": "OFFLINE",
                    "threatsFound": 0,
                    "timestamp": datetime.utcnow().isoformat(),
                }
        except Exception as e:
            return {"status": "ERROR", "error": str(e)}

        try:
            files_raw = self.run_adb(["shell", "ls", "-R", self.target_device_dir])
            files = [f.strip() for f in files_raw.splitlines() if f.strip()]
        except Exception:
            files = []

        detected_threats = []
        for file_entry in files:
            for bad_sig in self.known_malicious_signatures:
                if bad_sig in file_entry.lower():
                    detected_threats.append(file_entry)

        if detected_threats:
            self.audit_logger.log_event(
                asset_id="device-adb-threat-sweep",
                status="BREACH_DETECTED",
                tamper_detected=True,
                details={
                    "rogueArtifacts": detected_threats,
                    "targetDir": self.target_device_dir,
                },
            )

            self.webhook_dispatcher.dispatch_alert(
                asset_id="device-adb-threat-sweep",
                status="MOBILE_SECURITY_BREACH",
                tamper_detected=True,
                details={"rogueArtifacts": detected_threats},
            )

            return {
                "status": "BREACH",
                "threatsFound": len(detected_threats),
                "artifacts": detected_threats,
                "timestamp": datetime.utcnow().isoformat(),
            }

        return {
            "status": "CLEAN",
            "threatsFound": 0,
            "timestamp": datetime.utcnow().isoformat(),
        }


if __name__ == "__main__":
    sweeper = AdbThreatSweep()
    print(json.dumps(sweeper.sweep_device(), indent=2))
