import os
import time
import json
import pytest
import requests
import websocket
import psycopg2
from confluent_kafka import Producer, Consumer, KafkaError

# Configuration from environment variables
GATEWAY_URL = os.getenv("GATEWAY_URL", "http://localhost:8000")
PATHWAY_URL = os.getenv("PATHWAY_URL", "http://localhost:8002")
VECTOR_SEARCH_URL = os.getenv("VECTOR_SEARCH_URL", "http://localhost:8003")
NLP_URL = os.getenv("NLP_URL", "http://localhost:8004")
KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:29092")

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_NAME = os.getenv("DB_NAME", "peptiprompt")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "postgres")


def get_auth_headers(role="researcher"):
    """Fetches a JWT token from the gateway and returns authorization headers."""
    url = f"{GATEWAY_URL}/token"
    data = {
        "username": role,
        "password": role
    }
    response = requests.post(url, data=data, timeout=5)
    response.raise_for_status()
    token = response.json()["access_token"]
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }


def get_db_connection():
    """Establishes database connection to PG SQL store."""
    return psycopg2.connect(
        host=DB_HOST,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD
    )


def test_health_checks():
    """Verify health endpoints of Gateway and all downstream helper microservices."""
    endpoints = {
        "gateway": f"{GATEWAY_URL}/health",
        "pathway": f"{PATHWAY_URL}/health",
        "vector_search": f"{VECTOR_SEARCH_URL}/health",
        "nlp": f"{NLP_URL}/health"
    }
    for name, url in endpoints.items():
        response = requests.get(url, timeout=5)
        assert response.status_code == 200, f"{name} health check failed."
        data = response.json()
        assert data["status"] == "healthy", f"{name} is not healthy."


def test_nlp_parsing():
    """Verify NLP semantic parsing of unstructured biological context."""
    url = f"{NLP_URL}/api/v1/nlp/parse"
    payload = {
        "text": "Correcting mitochondrial tagging deficits in neurons after viral exposure",
        "context_id": "test_ctx_01"
    }
    response = requests.post(url, json=payload, timeout=5)
    assert response.status_code == 200
    data = response.json()
    assert "PINK1" in data["target_proteins"]
    assert "Parkin" in data["target_proteins"]
    assert "Mitochondrial Autophagy" in data["affected_pathways"]
    assert data["constraint_parameters"]["tissue_specific_context"] == "neurons"


def test_pathway_query():
    """Verify graph database pathway retrieval."""
    url = f"{PATHWAY_URL}/api/v1/pathways/mitochondrial_tagging"
    response = requests.get(url, timeout=5)
    assert response.status_code == 200
    data = response.json()
    assert "nodes" in data
    assert "edges" in data
    
    # Assert presence of critical mitophagy proteins
    node_ids = [n["id"] for n in data["nodes"]]
    assert "PINK1" in node_ids
    assert "Parkin" in node_ids
    assert "LC3-II" in node_ids
    
    # Check edges
    edge_targets = [e["target"] for e in data["edges"]]
    assert "Mfn2" in edge_targets


def test_vector_search():
    """Verify vector search similarity mapping to historical designs."""
    url = f"{VECTOR_SEARCH_URL}/api/v1/search/vectors"
    payload = {
        "query": "mitochondrial neuropathy",
        "limit": 2
    }
    response = requests.post(url, json=payload, timeout=5)
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0
    assert "score" in data[0]
    assert "payload" in data[0]
    assert "sequence" in data[0]["payload"]
    # Check that PEP-1042 or PEP-4109 appears since it splits query and weights matches
    matched_ids = [item["payload"]["id"] for item in data]
    assert any(x in matched_ids for x in ["PEP-1042", "PEP-4109", "PEP-2210"])


def test_gateway_graphql():
    """Verify GraphQL queries to search design status from metadata registry."""
    url = f"{GATEWAY_URL}/graphql"
    query = """
    query {
      getDesign(designId: "pep_test_123") {
        designId
        status
        targetProtein
      }
    }
    """
    response = requests.post(url, json={"query": query}, timeout=5)
    assert response.status_code == 200
    data = response.json()
    assert "errors" not in data
    design = data["data"]["getDesign"]
    assert design["designId"] == "pep_test_123"
    # Fallback response is COMPLETED or UNKNOWN depending on DB presence
    assert design["status"] in ["COMPLETED", "UNKNOWN"]


def test_end_to_end_peptide_design_pipeline():
    """
    Triggers de novo peptide design, monitors live WebSocket telemetry,
    polls the Gateway for completion, and validates all generated physical
    and conformal risk descriptors.
    """
    headers = get_auth_headers("researcher")
    
    # 1. Trigger peptide design
    url = f"{GATEWAY_URL}/api/v1/peptides/design"
    idempotency_key = f"idem_{int(time.time())}"
    design_payload = {
        "prompt": "Correcting mitochondrial tagging deficits in neurons after viral exposure",
        "disease_state": "Mitochondrial Tagging Deficit (Post-Viral Neuropathy)",
        "target_protein": "PINK1 / Parkin",
        "user_id": "test_user_integration",
        "simulation_complexity": "standard",
        "is_encrypted": False,
        "epsilon": 1.0
    }
    
    # Send with custom headers
    design_headers = dict(headers)
    design_headers["Idempotency-Key"] = idempotency_key
    
    response = requests.post(url, json=design_payload, headers=design_headers, timeout=5)
    assert response.status_code == 200
    design_data = response.json()
    assert design_data["status"] == "QUEUED"
    design_id = design_data["design_id"]
    assert design_id.startswith("pep_")
    
    # Test Idempotency key replay
    dup_response = requests.post(url, json=design_payload, headers=design_headers, timeout=5)
    assert dup_response.status_code == 200
    assert dup_response.json()["design_id"] == design_id
    assert dup_response.json()["status"] == "QUEUED"

    # 2. Test WebSocket Telemetry Broadcaster
    # Parse Gateway URL to ws://
    ws_base = GATEWAY_URL.replace("http://", "ws://").replace("https://", "wss://")
    ws_url = f"{ws_base}/ws/telemetry/{design_id}"
    
    ws = websocket.create_connection(ws_url, timeout=10)
    stages_seen = []
    
    try:
        # Read streaming telemetry events (up to 7 updates are sent in the mock)
        for _ in range(10):
            try:
                msg = ws.recv()
                event = json.loads(msg)
                assert event["design_id"] == design_id
                stages_seen.append(event["stage"])
                if event["stage"] == "COMPLETED":
                    assert event["progress"] == 100
                    break
            except websocket.WebSocketTimeoutException:
                break
    finally:
        ws.close()
        
    assert "DIFFUSION_GENERATION" in stages_seen
    assert "DIGITAL_TWIN_SIMULATION" in stages_seen
    assert "COMPLETED" in stages_seen

    # 3. Poll Gateway until Design status is COMPLETED
    result_url = f"{GATEWAY_URL}/api/v1/peptides/{design_id}"
    completed = False
    
    for _ in range(30):
        res = requests.get(result_url, headers=headers, timeout=5)
        assert res.status_code == 200
        result_data = res.json()
        if result_data["status"] == "COMPLETED":
            completed = True
            break
        time.sleep(2)
        
    assert completed, "Design pipeline failed to transition to COMPLETED."
    
    # 4. Deep Inspection of Generated Pipeline Output
    assert len(result_data["sequence"]) > 0
    assert result_data["binding_affinity"] < 0.0
    assert 0.0 <= result_data["stability"] <= 1.0
    assert "INITIATE_SYNTHESIS" in result_data["synthesis_script"]
    
    # Conformal predictions
    assert result_data["therapeutic_index"] is not None
    assert result_data["ti_lower"] is not None
    assert result_data["ti_upper"] is not None
    assert result_data["ti_lower"] <= result_data["therapeutic_index"] <= result_data["ti_upper"]
    
    # Adverse events probabilities & conformal calibration
    assert "Apoptosis Pathway Activation" in result_data["adverse_events"]["probabilities"]
    assert "Apoptosis Pathway Activation" in result_data["adverse_events"]["conformal_thresholds"]
    assert result_data["adverse_events"]["adverse_risk_level"] in ["LOW", "MEDIUM", "HIGH"]
    
    # Dose Response
    assert len(result_data["dose_response"]["doses_uM"]) == 7
    assert "HillSlope" in result_data["dose_response"]["hill_parameters"]
    
    # Data Governance compliance features
    assert result_data["provenance_token"].startswith("prov_")
    assert result_data["biosecurity_status"] == "CLEARED"
    assert len(result_data["consent_token"]) > 0
    assert result_data["epsilon"] == 1.0
    assert result_data["dp_binding_affinity"] is not None
    assert result_data["dp_stability"] is not None
    assert "# PEPTIDEOS CLINICAL & REGULATORY COMPLIANCE REPORT" in result_data["compliance_report"]


def test_biosecurity_blocking():
    """
    Test biosecurity select-agent sequence screening blockages.
    Injects a designed peptide with blacklisted CDC/Australia Group toxin sequence motifs
    directly into Kafka and verifies PostgreSQL states and blocked synthesis flags.
    """
    headers = get_auth_headers("researcher")
    design_id = f"pep_blocked_{int(time.time())}"
    
    # Connect to PostgreSQL and seed initial metadata
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO designs (design_id, prompt, disease_state, target_protein, user_id, status, is_encrypted, consent_token, epsilon) 
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s);
        """,
        (
            design_id,
            "Ricin simulation test",
            "Dual-Use Validation",
            "Ricin Toxin A-Chain",
            "test_user_integration",
            "PENDING",
            False,
            "mock_consent_token_123",
            1.0
        )
    )
    conn.commit()
    cursor.close()
    conn.close()

    # Configure a Kafka producer and inject designed-peptides event containing blacklisted "TFT" Ricin motif
    producer_conf = {'bootstrap.servers': KAFKA_BOOTSTRAP_SERVERS}
    producer = Producer(producer_conf)
    
    payload = {
        "design_id": design_id,
        "prompt": "Ricin simulation test",
        "disease_state": "Dual-Use Validation",
        "target_protein": "Ricin Toxin A-Chain",
        # Blacklisted motif: TFT (Ricin)
        "sequence": "MGAFLTFTLKACVALLSGKLL-NH2",
        "simulation_complexity": "standard",
        "is_encrypted": False,
        "consent_token": "mock_consent_token_123",
        "epsilon": 1.0,
        "timestamp": time.time()
    }
    
    producer.produce(
        'designed-peptides',
        key=design_id,
        value=json.dumps(payload)
    )
    producer.flush()
    
    # Wait for the Simulation Service consumer to process the event, screen it, and update PG
    result_url = f"{GATEWAY_URL}/api/v1/peptides/{design_id}"
    blocked = False
    
    for _ in range(15):
        res = requests.get(result_url, headers=headers, timeout=5)
        assert res.status_code == 200
        result_data = res.json()
        if result_data["status"] == "COMPLETED" and result_data["biosecurity_status"] == "BLOCKED":
            blocked = True
            break
        time.sleep(2)
        
    assert blocked, "Toxin sequence failed to trigger biosecurity regulatory blocks."
    
    # Assert sequence masking and synthesis blockages
    assert result_data["sequence"] == "[BLOCKED - BIOSECURITY THREAT FLAG]"
    assert "BLOCKED BY DATA GOVERNANCE SYSTEM" in result_data["synthesis_script"]
    assert "Sequence match found for dual-use regulated agent: Ricin Toxin A-Chain" in result_data["compliance_report"]


def test_immutable_audit_logs():
    """Verify cryptographic audit trail logs and hash integrity verification."""
    headers = get_auth_headers("researcher")
    url = f"{GATEWAY_URL}/api/v1/governance/audit-logs"
    
    response = requests.get(url, headers=headers, timeout=5)
    assert response.status_code == 200
    data = response.json()
    
    # Assert overall chain validity
    assert data["integrity_valid"] is True
    assert len(data["logs"]) > 0
    
    # Traverse blocks and verify hash chain properties
    logs = data["logs"]
    for i in range(1, len(logs)):
        # Current prev_hash must match the block_hash of the previous index
        assert logs[i]["prev_hash"] == logs[i-1]["block_hash"], f"Ledger hash chain broken at index {i}"
        # Assert integrity of each individual block
        assert logs[i]["integrity_valid"] is True


def test_observability_endpoints():
    """Verify real-time model drift and API latency metrics."""
    headers = get_auth_headers("researcher")
    
    # Metrics
    metrics_url = f"{GATEWAY_URL}/api/v1/observability/metrics"
    response = requests.get(metrics_url, headers=headers, timeout=5)
    assert response.status_code == 200
    metrics = response.json()
    assert "total_requests" in metrics
    assert "average_latency_seconds" in metrics
    
    # Model Drift
    drift_url = f"{GATEWAY_URL}/api/v1/observability/drift"
    response = requests.get(drift_url, headers=headers, timeout=5)
    assert response.status_code == 200
    drift = response.json()
    assert "sequence_length_drift_detected" in drift
    assert "token_distribution_drift_detected" in drift


if __name__ == "__main__":
    pytest.main(["-v", __file__])
