import json
import os
from datetime import datetime

try:
    from .webhook_dispatcher import CipherTubeWebhookDispatcher
except ImportError:
    from webhook_dispatcher import CipherTubeWebhookDispatcher


class CipherTubeAuditLogger:
    def __init__(
        self, log_dir: str = "./audit_logs", log_filename: str = "audit_log.jsonl"
    ):
        self.log_dir = log_dir
        os.makedirs(self.log_dir, exist_ok=True)
        self.log_path = os.path.join(self.log_dir, log_filename)
        self.webhook_dispatcher = CipherTubeWebhookDispatcher()

    def log_event(
        self, asset_id: str, status: str, tamper_detected: bool, details: dict = None
    ) -> dict:
        event = {
            "timestamp": datetime.utcnow().isoformat(),
            "assetId": asset_id,
            "status": status,
            "tamperDetected": tamper_detected,
            "details": details or {},
        }

        with open(self.log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(event) + "\n")

        if tamper_detected or status != "SUCCESS":
            self.webhook_dispatcher.dispatch_alert(
                asset_id, status, tamper_detected, details
            )

        return event

    def get_audit_summary(self) -> dict:
        if not os.path.exists(self.log_path):
            return {"totalEvents": 0, "tamperAlerts": 0, "successCount": 0}

        total_events = 0
        tamper_alerts = 0
        success_count = 0

        with open(self.log_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    total_events += 1
                    data = json.loads(line)
                    if data.get("tamperDetected"):
                        tamper_alerts += 1
                    if data.get("status") == "SUCCESS":
                        success_count += 1

        return {
            "totalEvents": total_events,
            "tamperAlerts": tamper_alerts,
            "successCount": success_count,
            "logFile": self.log_path,
        }
