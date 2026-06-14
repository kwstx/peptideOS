import os
import time
import json
import pytest
import requests
import websocket
import re

# Configuration
GATEWAY_URL = os.getenv("GATEWAY_URL", "http://127.0.0.1:8000")
PATHWAY_URL = os.getenv("PATHWAY_URL", "http://127.0.0.1:8002")
VECTOR_SEARCH_URL = os.getenv("VECTOR_SEARCH_URL", "http://127.0.0.1:8003")
NLP_URL = os.getenv("NLP_URL", "http://127.0.0.1:8004")

# Defined Latency Bounds (in seconds)
MAX_HEALTH_LATENCY = 1.0
MAX_PARSING_LATENCY = 2.0
MAX_QUERY_LATENCY = 2.0
MAX_PIPELINE_LATENCY = 12.0  # Max acceptable time for the full cycle

# Chemically Valid Amino Acids set (standard 20 residues)
VALID_AMINO_ACIDS = set("ACDEFGHIKLMNPQRSTVWY")

# Diverse disease prompts representing mitochondrial, neuronal, and post-viral contexts
TEST_PROMPTS = [
    {
        "context": "Mitochondrial",
        "prompt": "Restoring PINK1 expression to rescue defective mitophagy in patients",
        "disease_state": "Mitochondrial Autophagy Deficit",
        "target_protein": "PINK1 / Parkin",
        "expected_proteins": ["PINK1", "Parkin"],
        "expected_pathways": ["Mitochondrial Autophagy", "Ubiquitin-Proteasome System"]
    },
    {
        "context": "Neuronal",
        "prompt": "Activating Parkin translocation in dopaminergic cells for Parkinson's disease",
        "disease_state": "Parkinson's Disease (Dopaminergic)",
        "target_protein": "PINK1 / Parkin",
        "expected_proteins": ["PINK1", "Parkin"],
        "expected_pathways": ["Mitochondrial Autophagy", "Ubiquitin-Proteasome System"]
    },
    {
        "context": "Post-Viral",
        "prompt": "Correcting mitochondrial tagging deficits in neurons after viral exposure",
        "disease_state": "Mitochondrial Tagging Deficit (Post-Viral Neuropathy)",
        "target_protein": "PINK1 / Parkin",
        "expected_proteins": ["PINK1", "Parkin"],
        "expected_pathways": ["Mitochondrial Autophagy", "Ubiquitin-Proteasome System"]
    }
]


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


def verify_peptide_chemical_validity(sequence: str):
    """
    Asserts that the peptide sequence is chemically valid:
    - Ends with standard C-terminal capping modifier '-NH2'
    - Contains only standard 20 amino acid residues after strip
    - Non-empty residues list
    """
    assert sequence.endswith("-NH2"), "Sequence must contain the capping modifier -NH2"
    clean_seq = sequence.replace("-NH2", "")
    assert len(clean_seq) > 0, "Sequence cannot be empty"
    for char in clean_seq:
        assert char in VALID_AMINO_ACIDS, f"Invalid amino acid character '{char}' in peptide sequence"


def test_service_health_endpoints():
    """Verify latency and correctness of health status checks across all services."""
    endpoints = {
        "gateway": f"{GATEWAY_URL}/health",
        "pathway": f"{PATHWAY_URL}/health",
        "vector_search": f"{VECTOR_SEARCH_URL}/health",
        "nlp": f"{NLP_URL}/health"
    }
    for name, url in endpoints.items():
        start_time = time.time()
        response = requests.get(url, timeout=5)
        duration = time.time() - start_time
        
        # Assert latency bound
        assert duration < MAX_HEALTH_LATENCY, f"{name} health check took {duration:.2f}s, exceeding limit of {MAX_HEALTH_LATENCY}s"
        assert response.status_code == 200, f"{name} health check returned status {response.status_code}"
        
        data = response.json()
        assert data["status"] == "healthy", f"{name} service status is not healthy"


@pytest.mark.parametrize("scenario", TEST_PROMPTS)
def test_nlp_parsing_workflows(scenario):
    """Verify structured NLP parsing results and latency bounds for different prompts."""
    url = f"{NLP_URL}/api/v1/nlp/parse"
    payload = {
        "text": scenario["prompt"],
        "context_id": f"e2e_ctx_{scenario['context'].lower()}"
    }
    
    start_time = time.time()
    response = requests.post(url, json=payload, timeout=5)
    duration = time.time() - start_time
    
    assert duration < MAX_PARSING_LATENCY, f"NLP parsing took {duration:.2f}s, exceeding {MAX_PARSING_LATENCY}s"
    assert response.status_code == 200
    
    data = response.json()
    
    # Assert extracted entities and pathways are mapped correctly
    for exp_p in scenario["expected_proteins"]:
        assert exp_p in data["target_proteins"], f"Expected target protein '{exp_p}' not found in NLP output"
        
    for exp_path in scenario["expected_pathways"]:
        assert any(exp_path in pw for pw in data["affected_pathways"]), f"Expected pathway '{exp_path}' not found in NLP output"


def test_pathway_query_graph():
    """Verify path exploration and signaling retrieval via pathway service."""
    url = f"{PATHWAY_URL}/api/v1/pathways/mitochondrial_tagging"
    
    start_time = time.time()
    response = requests.get(url, timeout=5)
    duration = time.time() - start_time
    
    assert duration < MAX_QUERY_LATENCY, f"Pathway query took {duration:.2f}s, exceeding {MAX_QUERY_LATENCY}s"
    assert response.status_code == 200
    
    data = response.json()
    assert "nodes" in data
    assert "edges" in data
    
    node_ids = [n["id"] for n in data["nodes"]]
    assert "PINK1" in node_ids
    assert "Parkin" in node_ids
    assert "Mfn2" in node_ids


def test_vector_search_matching():
    """Verify vector search returns close matches based on disease contexts."""
    url = f"{VECTOR_SEARCH_URL}/api/v1/search/vectors"
    payload = {
        "query": "mitochondrial tagging defect in neurons",
        "limit": 3
    }
    
    start_time = time.time()
    response = requests.post(url, json=payload, timeout=5)
    duration = time.time() - start_time
    
    assert duration < MAX_QUERY_LATENCY, f"Vector search took {duration:.2f}s, exceeding {MAX_QUERY_LATENCY}s"
    assert response.status_code == 200
    
    data = response.json()
    assert len(data) > 0
    assert "score" in data[0]
    assert "payload" in data[0]
    
    # Assert matched design has expected fields
    matched_design = data[0]["payload"]
    assert "id" in matched_design
    assert "sequence" in matched_design
    verify_peptide_chemical_validity(matched_design["sequence"])


@pytest.mark.parametrize("scenario", TEST_PROMPTS)
def test_end_to_end_peptide_design_cycle(scenario):
    """
    Submits disease state design requests to API Gateway, monitors telemetry via WebSocket,
    polls gateway, and asserts structural, chemical, and biological perturbation correctness.
    """
    headers = get_auth_headers("researcher")
    
    # 1. Trigger design request
    url = f"{GATEWAY_URL}/api/v1/peptides/design"
    payload = {
        "prompt": scenario["prompt"],
        "disease_state": scenario["disease_state"],
        "target_protein": scenario["target_protein"],
        "user_id": "e2e_test_user",
        "simulation_complexity": "standard",
        "is_encrypted": False,
        "epsilon": 1.0
    }
    
    start_time = time.time()
    response = requests.post(url, json=payload, headers=headers, timeout=5)
    assert response.status_code == 200
    
    design_data = response.json()
    assert design_data["status"] == "QUEUED"
    design_id = design_data["design_id"]
    assert design_id.startswith("pep_")
    
    # 2. Assert WebSockets telemetries are broadcast correctly
    ws_base = GATEWAY_URL.replace("http://", "ws://").replace("https://", "wss://")
    ws_url = f"{ws_base}/ws/telemetry/{design_id}"
    
    ws = websocket.create_connection(ws_url, timeout=5)
    stages_seen = []
    try:
        # Read the streaming updates (7 updates in uvicorn mock)
        for _ in range(10):
            try:
                msg = ws.recv()
                event = json.loads(msg)
                assert event["design_id"] == design_id
                stages_seen.append(event["stage"])
                if event["stage"] == "COMPLETED":
                    break
            except websocket.WebSocketTimeoutException:
                break
    finally:
        ws.close()
        
    assert "DIFFUSION_GENERATION" in stages_seen
    assert "DIGITAL_TWIN_SIMULATION" in stages_seen
    assert "COMPLETED" in stages_seen
    
    # 3. Poll for design completion
    result_url = f"{GATEWAY_URL}/api/v1/peptides/{design_id}"
    completed = False
    result_data = None
    
    # Loop for up to MAX_PIPELINE_LATENCY seconds
    loop_start = time.time()
    while time.time() - loop_start < MAX_PIPELINE_LATENCY:
        res = requests.get(result_url, headers=headers, timeout=5)
        assert res.status_code == 200
        res_data = res.json()
        if res_data["status"] == "COMPLETED":
            completed = True
            result_data = res_data
            break
        time.sleep(1.0)
        
    assert completed, f"E2E design pipeline did not complete within latency bound of {MAX_PIPELINE_LATENCY} seconds"
    
    # 4. Assert Chemical Validity of sequence
    assert "sequence" in result_data
    verify_peptide_chemical_validity(result_data["sequence"])
    
    # 5. Assert Synthesis-ready scripts presence
    assert "synthesis_script" in result_data
    assert "INITIATE_SYNTHESIS" in result_data["synthesis_script"] or "FMOC" in result_data["synthesis_script"]
    
    # 6. Assert Efficacy & Conformal Risk Reports
    assert "therapeutic_index" in result_data
    assert result_data["ti_lower"] is not None and result_data["ti_upper"] is not None
    assert result_data["ti_lower"] <= result_data["therapeutic_index"] <= result_data["ti_upper"]
    
    assert "dose_response" in result_data
    assert "doses_uM" in result_data["dose_response"]
    assert len(result_data["dose_response"]["doses_uM"]) == 7
    
    assert "adverse_events" in result_data
    assert "probabilities" in result_data["adverse_events"]
    assert "adverse_risk_level" in result_data["adverse_events"]
    
    # 7. Assert consistency with expected pathway perturbation signatures
    # (Checking if binding affinity and stability exist and are mathematically sensible)
    assert result_data["binding_affinity"] < 0.0, "Binding affinity docking score should be negative (exothermic)"
    assert 0.0 <= result_data["stability"] <= 1.0, "Stability score should be in standard probability range [0, 1]"
    assert "provenance_token" in result_data
    assert result_data["provenance_token"].startswith("prov_")
    
    print(f"Successfully verified E2E flow for scenario: {scenario['context']}")


if __name__ == "__main__":
    pytest.main(["-v", __file__])
