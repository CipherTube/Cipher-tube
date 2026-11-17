from datetime import datetime

try:
    from .audit_logger import CipherTubeAuditLogger
except ImportError:
    from audit_logger import CipherTubeAuditLogger
try:
    from .webhook_dispatcher import CipherTubeWebhookDispatcher
except ImportError:
    from webhook_dispatcher import CipherTubeWebhookDispatcher


class CypherTubeInterceptorShield:
    def __init__(self):
        self.audit_logger = CipherTubeAuditLogger()
        self.webhook_dispatcher = CipherTubeWebhookDispatcher()
        self.blacklisted_signers = {"malicious-actor-888", "unauthorized-rogue-node"}

    def inspect_and_intercept(self, verification_request: dict) -> dict:
        manifest = verification_request.get("manifestStore", {})
        bindings = verification_request.get("hardBindings", [])
        signature = verification_request.get("claimSignature", {})

        signer_id = signature.get("signerId", "unknown")
        manifest_id = manifest.get("manifestId", "unknown")

        if signer_id in self.blacklisted_signers:
            return self._trigger_counter_measure(
                asset_id=manifest_id,
                threat_type="HOSTILE_SIGNER_INJECTION",
                details={"signerId": signer_id, "action": "Intercepted and Blocked"},
            )

        for binding in bindings:
            digest = binding.get("digest", "")
            if len(digest) != 64 and len(digest) != 96:
                return self._trigger_counter_measure(
                    asset_id=manifest_id,
                    threat_type="MALFORMED_CRYPTO_DIGEST",
                    details={"digest": digest, "action": "Payload Sanitized & Dropped"},
                )

        return {
            "status": "APPROVED",
            "threatDetected": False,
            "interceptedAt": datetime.utcnow().isoformat(),
        }

    def _trigger_counter_measure(
        self, asset_id: str, threat_type: str, details: dict
    ) -> dict:
        alert_details = {
            "threatType": threat_type,
            "mitigationAction": details.get("action", "Blocked"),
            "rawDetails": details,
            "interceptorVersion": "3.0-intercept",
        }

        self.audit_logger.log_event(
            asset_id=asset_id,
            status="INTERCEPTED_THREAT",
            tamper_detected=True,
            details=alert_details,
        )

        self.webhook_dispatcher.dispatch_alert(
            asset_id=asset_id,
            status="DEFENSIVE_BLOCK",
            tamper_detected=True,
            details=alert_details,
        )

        return {
            "status": "BLOCKED",
            "threatDetected": True,
            "threatType": threat_type,
            "message": "Access denied by CypherTube 3rd-Eye Interceptor Shield.",
        }
