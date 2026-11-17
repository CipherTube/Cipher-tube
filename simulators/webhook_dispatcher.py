import json
import os

import requests


class CipherTubeWebhookDispatcher:
    def __init__(self, webhook_url: str = None):
        self.webhook_url = webhook_url or os.getenv("CIPHER_TUBE_WEBHOOK_URL", "")

    def dispatch_alert(
        self, asset_id: str, status: str, tamper_detected: bool, details: dict = None
    ) -> bool:
        if not self.webhook_url:
            return False

        severity_emoji = "🚨" if tamper_detected else "🛡️"
        title = (
            "TAMPER DETECTED - C2PA SECURITY ALERT"
            if tamper_detected
            else "Verification Event Logged"
        )

        payload = {
            "content": f"{severity_emoji} **{title}**",
            "embeds": [
                {
                    "title": f"Asset ID: {asset_id}",
                    "color": 16711680 if tamper_detected else 65280,
                    "fields": [
                        {"name": "Status", "value": status, "inline": True},
                        {
                            "name": "Tamper Detected",
                            "value": str(tamper_detected),
                            "inline": True,
                        },
                        {
                            "name": "Details",
                            "value": json.dumps(details or {}, indent=2),
                            "inline": False,
                        },
                    ],
                    "footer": {
                        "text": "Cipher-Tube Repository Intelligence Engine / ightevenmckane187"
                    },
                }
            ],
        }

        try:
            response = requests.post(
                self.webhook_url,
                data=json.dumps(payload),
                headers={"Content-Type": "application/json"},
                timeout=5,
            )
            return response.status_code in [200, 201, 204]
        except Exception:
            return False
