import pytest
import json
from unittest.mock import patch, MagicMock
from simulators.audit_logger import CipherTubeAuditLogger
from simulators.webhook_dispatcher import CipherTubeWebhookDispatcher

@pytest.fixture
def temp_audit_env(tmp_path):
    log_dir = tmp_path / "audit_logs"
    return CipherTubeAuditLogger(log_dir=str(log_dir), log_filename="test_audit.jsonl")

def test_audit_logger_records_event(temp_audit_env):
    event = temp_audit_env.log_event("asset-1", "SUCCESS", False, {})
    assert event["status"] == "SUCCESS"
    summary = temp_audit_env.get_audit_summary()
    assert summary["totalEvents"] == 1

@patch("requests.post")
def test_webhook_dispatcher_alert(mock_post):
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_post.return_value = mock_response

    dispatcher = CipherTubeWebhookDispatcher(webhook_url="https://discord.com/api/webhooks/mock/url")
    result = dispatcher.dispatch_alert("asset-2", "FAILED", True, {})
    assert result is True
