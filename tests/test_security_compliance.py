import os
import sys
import time
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

# 1. Setup paths to allow direct imports of modular services
gateway_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'services', 'gateway'))
if gateway_path not in sys.path:
    sys.path.insert(0, gateway_path)

import main as gateway_main
from governance import (
    CryptographicManager,
    ImmutableAuditLedger,
    DifferentialPrivacyManager,
    ComplianceValidator
)

# Initialize FastAPI TestClient
client = TestClient(gateway_main.app)


# ==============================================================================
# SECTION 1: AUTHENTICATION FLOWS AND RBAC PENETRATION TESTING
# ==============================================================================

def create_jwt_token(username: str, role: str) -> str:
    """Helper to generate JWT tokens with custom roles."""
    from datetime import datetime, timedelta
    from jose import jwt
    
    expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode = {"sub": username, "role": role, "exp": expire}
    return jwt.encode(to_encode, gateway_main.SECRET_KEY, algorithm=gateway_main.ALGORITHM)


def test_auth_missing_token():
    """Verify that requests without authorization headers are rejected."""
    response = client.post("/api/v1/peptides/design", json={
        "prompt": "Test prompt",
        "disease_state": "Mitochondrial deficit",
        "target_protein": "PINK1",
        "user_id": "user123"
    })
    assert response.status_code == 401
    assert "Not authenticated" in response.json()["detail"]


def test_auth_invalid_token():
    """Verify that requests with invalid/malformed JWT tokens are rejected."""
    headers = {"Authorization": "Bearer invalid_token_xyz"}
    response = client.post("/api/v1/peptides/design", json={
        "prompt": "Test prompt",
        "disease_state": "Mitochondrial deficit",
        "target_protein": "PINK1",
        "user_id": "user123"
    }, headers=headers)
    assert response.status_code == 401
    assert "Could not validate credentials" in response.json()["detail"]


def test_auth_expired_token():
    """Verify that requests with expired JWT tokens are rejected."""
    from jose import jwt
    from datetime import datetime, timedelta
    
    # Generate token with negative expiration time
    expire = datetime.utcnow() - timedelta(minutes=15)
    to_encode = {"sub": "researcher", "role": "researcher", "exp": expire}
    expired_token = jwt.encode(to_encode, gateway_main.SECRET_KEY, algorithm=gateway_main.ALGORITHM)
    
    headers = {"Authorization": f"Bearer {expired_token}"}
    response = client.post("/api/v1/peptides/design", json={
        "prompt": "Test prompt",
        "disease_state": "Mitochondrial deficit",
        "target_protein": "PINK1",
        "user_id": "user123"
    }, headers=headers)
    assert response.status_code == 401


def test_rbac_authorized_researcher():
    """Verify that a user with 'researcher' role can access the design endpoint."""
    token = create_jwt_token("research_user", "researcher")
    headers = {"Authorization": f"Bearer {token}"}
    
    response = client.post("/api/v1/peptides/design", json={
        "prompt": "Test prompt",
        "disease_state": "Mitochondrial deficit",
        "target_protein": "PINK1",
        "user_id": "user123"
    }, headers=headers)
    # The endpoint triggers background task and returns 200 QUEUED
    assert response.status_code == 200
    assert response.json()["status"] == "QUEUED"


def test_rbac_authorized_admin():
    """Verify that a user with 'admin' role can access the design endpoint (privilege inheritance)."""
    token = create_jwt_token("admin_user", "admin")
    headers = {"Authorization": f"Bearer {token}"}
    
    response = client.post("/api/v1/peptides/design", json={
        "prompt": "Test prompt",
        "disease_state": "Mitochondrial deficit",
        "target_protein": "PINK1",
        "user_id": "user123"
    }, headers=headers)
    assert response.status_code == 200
    assert response.json()["status"] == "QUEUED"


def test_rbac_unauthorized_role():
    """Verify that a user with an unauthorized role (e.g. 'guest') is rejected with 403 Forbidden."""
    token = create_jwt_token("guest_user", "guest")
    headers = {"Authorization": f"Bearer {token}"}
    
    response = client.post("/api/v1/peptides/design", json={
        "prompt": "Test prompt",
        "disease_state": "Mitochondrial deficit",
        "target_protein": "PINK1",
        "user_id": "user123"
    }, headers=headers)
    assert response.status_code == 403
    assert "Not enough permissions" in response.json()["detail"]


# ==============================================================================
# SECTION 2: RATE-LIMITING ENFORCEMENT
# ==============================================================================

def test_rate_limiting_enforcement():
    """
    Verify rate limiting middleware.
    Overwrites threshold temporarily to test that requests exceeding the limit are blocked with 429.
    """
    # Override configuration
    original_max = gateway_main.RATE_LIMIT_MAX_REQUESTS
    original_window = gateway_main.RATE_LIMIT_WINDOW_SECONDS
    
    gateway_main.RATE_LIMIT_MAX_REQUESTS = 3
    gateway_main.RATE_LIMIT_WINDOW_SECONDS = 5
    gateway_main.client_request_history.clear()
    
    token = create_jwt_token("research_user", "researcher")
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "prompt": "Test prompt",
        "disease_state": "Mitochondrial deficit",
        "target_protein": "PINK1",
        "user_id": "user123"
    }
    
    try:
        # Request 1, 2, 3 should succeed
        for i in range(3):
            response = client.post("/api/v1/peptides/design", json=payload, headers=headers)
            assert response.status_code == 200
            
        # Request 4 should be rate limited (429)
        response = client.post("/api/v1/peptides/design", json=payload, headers=headers)
        assert response.status_code == 429
        assert "Rate limit exceeded" in response.json()["detail"]
        
    finally:
        # Restore configuration
        gateway_main.RATE_LIMIT_MAX_REQUESTS = original_max
        gateway_main.RATE_LIMIT_WINDOW_SECONDS = original_window
        gateway_main.client_request_history.clear()


# ==============================================================================
# SECTION 3: DATA ENCRYPTION IN TRANSIT AND AT REST
# ==============================================================================

def test_e2ee_decryption_and_minimization():
    """
    Verify that E2EE encrypted inputs in transit are correctly decrypted at the gateway,
    subjected to PII scrubbing, and re-encrypted.
    """
    token = create_jwt_token("research_user", "researcher")
    headers = {"Authorization": f"Bearer {token}"}
    
    # 1. Encrypt inputs representing transit E2EE
    raw_prompt = "Mitophagy rescue prompt with contact email john.doe@example.com"
    raw_disease = "Mitophagy disease state"
    raw_target = "PINK1 protein"
    
    enc_prompt = CryptographicManager.encrypt({"val": raw_prompt})
    enc_disease = CryptographicManager.encrypt({"val": raw_disease})
    enc_target = CryptographicManager.encrypt({"val": raw_target})
    
    # 2. Mock database connection to intercept database writes (encryption at rest check)
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value = mock_cursor
    
    with patch("main.get_db_connection", return_value=mock_conn):
        response = client.post("/api/v1/peptides/design", json={
            "prompt": enc_prompt,
            "disease_state": enc_disease,
            "target_protein": enc_target,
            "user_id": "user123",
            "is_encrypted": True
        }, headers=headers)
        
        assert response.status_code == 200
        
        # 3. Verify parameters passed to database write
        # Check that executed query uses encrypted placeholders and actual arguments are encrypted
        calls = mock_cursor.execute.call_args_list
        assert len(calls) >= 1
        
        # Extract arguments of the INSERT INTO designs call
        insert_call = None
        for call in calls:
            query_str = call[0][0]
            if "INSERT INTO designs" in query_str:
                insert_call = call[0]
                break
                
        assert insert_call is not None, "Metadata INSERT query was not executed"
        
        # Query arguments: (design_id, final_prompt, final_disease, final_target, user_id, status, is_encrypted, consent_token, epsilon)
        args = insert_call[1]
        written_prompt = args[1]
        written_disease = args[2]
        written_target = args[3]
        is_encrypted_flag = args[6]
        
        assert is_encrypted_flag is True
        
        # 4. Decrypt database records to verify they contain the PII-scrubbed original plaintext values
        decrypted_prompt = CryptographicManager.decrypt(written_prompt)["val"]
        decrypted_disease = CryptographicManager.decrypt(written_disease)["val"]
        decrypted_target = CryptographicManager.decrypt(written_target)["val"]
        
        # PII should be redacted
        assert "[REDACTED_EMAIL]" in decrypted_prompt
        assert "john.doe@example.com" not in decrypted_prompt
        assert "Mitophagy disease state" in decrypted_disease
        assert "PINK1 protein" in decrypted_target


def test_e2ee_decryption_failure():
    """Verify that malformed encrypted payloads result in 400 Bad Request."""
    token = create_jwt_token("research_user", "researcher")
    headers = {"Authorization": f"Bearer {token}"}
    
    response = client.post("/api/v1/peptides/design", json={
        "prompt": "not_a_valid_base64_ciphertext!!!",
        "disease_state": "some_state",
        "target_protein": "some_target",
        "user_id": "user123",
        "is_encrypted": True
    }, headers=headers)
    
    assert response.status_code == 400
    assert "Invalid encrypted payload" in response.json()["detail"]


# ==============================================================================
# SECTION 4: ADVERSARIAL INPUT FUZZING
# ==============================================================================

@pytest.mark.parametrize("fuzz_input, expected_status", [
    # SQL Injection attempts
    ("'; DROP TABLE designs; --", 200),
    ("' OR '1'='1", 200),
    # XSS script injection
    ("<script>alert('XSS')</script>", 200),
    # Extremely long string
    ("A" * 10000, 200),
    # Special character sequences
    ("!@#$%^&*()_+=-`{}[]|\\:;\"'<>,.?/~`", 200),
])
def test_adversarial_input_fuzzing(fuzz_input, expected_status):
    """
    Fuzz the inputs to ensure SQL injection, XSS, and malformed disease state 
    descriptions do not crash the REST layer and are handled securely.
    """
    token = create_jwt_token("research_user", "researcher")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Mock database to prevent actual database exceptions
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value = mock_cursor
    
    with patch("main.get_db_connection", return_value=mock_conn):
        response = client.post("/api/v1/peptides/design", json={
            "prompt": fuzz_input,
            "disease_state": fuzz_input,
            "target_protein": fuzz_input,
            "user_id": "user123",
            "is_encrypted": False
        }, headers=headers)
        
        # Verify that API handles the fuzz inputs without internal server error (500)
        assert response.status_code == expected_status
        if response.status_code == 200:
            assert response.json()["status"] == "QUEUED"


def test_malformed_json_schema():
    """Verify that requests violating Pydantic schema return 422 Unprocessable Entity instead of 500."""
    token = create_jwt_token("research_user", "researcher")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Missing required 'prompt' field
    response = client.post("/api/v1/peptides/design", json={
        "disease_state": "mitochondrial disease",
        "target_protein": "PINK1",
        "user_id": "user123"
    }, headers=headers)
    
    assert response.status_code == 422


# ==============================================================================
# SECTION 5: AUDIT TRAIL LEDGER COMPLETENESS
# ==============================================================================

def test_audit_trail_completeness_and_integrity():
    """
    Verify the cryptographic audit ledger integrity check.
    Ensures correct ledgers validate successfully, and tampered ones fail verification.
    """
    # 1. Create a mock connection with valid audit logs
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value = mock_cursor
    
    # Generate mock log database rows
    # Columns: index, timestamp, action, details, details_hash, prev_hash, block_hash, signature
    import hashlib
    import json
    
    details_1 = {"design_id": "pep_1", "user": "user1"}
    det_hash_1 = hashlib.sha256(json.dumps(details_1).encode('utf-8')).hexdigest()
    prev_hash_1 = "GENESIS_BLOCK_0000000000000000000000000000000000000000000000000000000"
    ts_1 = time.time() - 100
    block_hash_1 = ImmutableAuditLedger.compute_block_hash(0, ts_1, "GATEWAY_INGESTION", det_hash_1, prev_hash_1)
    sig_1 = ImmutableAuditLedger.compute_signature(block_hash_1)
    
    details_2 = {"design_id": "pep_2", "user": "user2"}
    det_hash_2 = hashlib.sha256(json.dumps(details_2).encode('utf-8')).hexdigest()
    prev_hash_2 = block_hash_1
    ts_2 = time.time() - 50
    block_hash_2 = ImmutableAuditLedger.compute_block_hash(1, ts_2, "SIMULATION_INVOCATION", det_hash_2, prev_hash_2)
    sig_2 = ImmutableAuditLedger.compute_signature(block_hash_2)
    
    valid_rows = [
        (0, ts_1, "GATEWAY_INGESTION", json.dumps(details_1), det_hash_1, prev_hash_1, block_hash_1, sig_1),
        (1, ts_2, "SIMULATION_INVOCATION", json.dumps(details_2), det_hash_2, prev_hash_2, block_hash_2, sig_2),
    ]
    
    # Test valid integrity verification
    mock_cursor.fetchall.return_value = valid_rows
    is_valid, report = ImmutableAuditLedger.verify_ledger_integrity(mock_conn)
    assert is_valid is True
    assert len(report) == 2
    assert report[0]["integrity_valid"] is True
    assert report[1]["integrity_valid"] is True
    
    # 2. Test tampered integrity verification (tampered detail payload)
    tampered_rows_details = [
        (0, ts_1, "GATEWAY_INGESTION", json.dumps({"tampered": "payload"}), det_hash_1, prev_hash_1, block_hash_1, sig_1),
        (1, ts_2, "SIMULATION_INVOCATION", json.dumps(details_2), det_hash_2, prev_hash_2, block_hash_2, sig_2),
    ]
    mock_cursor.fetchall.return_value = tampered_rows_details
    is_valid, report = ImmutableAuditLedger.verify_ledger_integrity(mock_conn)
    assert is_valid is False
    assert report[0]["integrity_valid"] is False
    
    # 3. Test tampered integrity verification (tampered signature)
    tampered_rows_sig = [
        (0, ts_1, "GATEWAY_INGESTION", json.dumps(details_1), det_hash_1, prev_hash_1, block_hash_1, "bad_signature_value"),
        (1, ts_2, "SIMULATION_INVOCATION", json.dumps(details_2), det_hash_2, prev_hash_2, block_hash_2, sig_2),
    ]
    mock_cursor.fetchall.return_value = tampered_rows_sig
    is_valid, report = ImmutableAuditLedger.verify_ledger_integrity(mock_conn)
    assert is_valid is False
    assert report[0]["integrity_valid"] is False


# ==============================================================================
# SECTION 6: DIFFERENTIAL PRIVACY NOISE VALIDATION
# ==============================================================================

def test_differential_privacy_noise_bounds_and_scaling():
    """
    Verify Laplace noise injection behavior under differential privacy parameters.
    Ensures noise standard deviation scales inversely with epsilon.
    """
    import numpy as np
    
    sensitivity = 1.0
    true_value = 10.0
    
    # 1. Test extremely high epsilon (no noise / close to zero)
    high_eps_values = [
        DifferentialPrivacyManager.inject_laplace_noise(true_value, sensitivity, epsilon=1e5)
        for _ in range(100)
    ]
    # Variance should be near zero, mean should be extremely close to true value
    assert np.allclose(high_eps_values, true_value, atol=1e-3)
    
    # 2. Test mathematical noise scaling comparing epsilon=1.0 and epsilon=0.1
    # Standard deviation of Laplace distribution = scale * sqrt(2) = (sensitivity / epsilon) * sqrt(2)
    # Epsilon = 1.0 -> scale = 1.0 -> theoretical std = 1.414
    # Epsilon = 0.1 -> scale = 10.0 -> theoretical std = 14.14
    
    np.random.seed(42) # Set seed for test reproducibility
    
    noise_eps_1 = [
        DifferentialPrivacyManager.inject_laplace_noise(true_value, sensitivity, epsilon=1.0) - true_value
        for _ in range(1000)
    ]
    noise_eps_01 = [
        DifferentialPrivacyManager.inject_laplace_noise(true_value, sensitivity, epsilon=0.1) - true_value
        for _ in range(1000)
    ]
    
    std_eps_1 = np.std(noise_eps_1)
    std_eps_01 = np.std(noise_eps_01)
    
    # Assert that variance scales as expected (std for epsilon=0.1 is approximately 10x larger than epsilon=1.0)
    assert 0.8 < std_eps_1 < 2.0
    assert 8.0 < std_eps_01 < 20.0
    assert std_eps_01 > std_eps_1 * 5 # Clearly demonstrates variance scaling
    
    # Check that noise is zero-centered
    assert abs(np.mean(noise_eps_1)) < 0.2
    assert abs(np.mean(noise_eps_01)) < 2.0
