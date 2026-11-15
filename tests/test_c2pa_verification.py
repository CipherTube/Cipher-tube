import pytest
from simulators.jumbf_simulator import JumbfSimulator

def test_jumbf_simulator_payload_structure():
    simulator = JumbfSimulator(asset_id="test-806", payload_data=b"Test payload bytes")
    payload = simulator.build_verification_payload()

    assert "assetPayload" in payload
    assert payload["manifestStore"]["manifestId"] == "urn:uuid:test-806"
    assert payload["hardBindings"][0]["hashAlgorithm"] == "c2pa.hash.data"
    assert len(payload["hardBindings"][0]["digest"]) == 64
    assert payload["claimSignature"]["signerId"] == "ightevenmckane187-authority"
