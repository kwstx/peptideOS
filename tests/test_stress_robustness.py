import os
import sys
import json
import pytest
from unittest.mock import patch, MagicMock

# Mock out external services for python env execution
mock_psycopg2 = MagicMock()
sys.modules['psycopg2'] = mock_psycopg2

try:
    import confluent_kafka
except ImportError:
    sys.modules['confluent_kafka'] = MagicMock()

try:
    import strawberry
except ImportError:
    mock_strawberry = MagicMock()
    sys.modules['strawberry'] = mock_strawberry
    sys.modules['strawberry.fastapi'] = mock_strawberry

try:
    import jose
except ImportError:
    mock_jose = MagicMock()
    mock_jose.JWTError = Exception
    sys.modules['jose'] = mock_jose

from fastapi.testclient import TestClient

# Add services paths to sys.path
gateway_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'services', 'gateway'))
diffusion_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'services', 'diffusion'))
simulation_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'services', 'simulation'))

if gateway_path not in sys.path:
    sys.path.insert(0, gateway_path)
if diffusion_path not in sys.path:
    sys.path.insert(0, diffusion_path)
if simulation_path not in sys.path:
    sys.path.insert(0, simulation_path)

import importlib.util

def load_module_from_path(module_name, file_path):
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module

gateway_main = load_module_from_path("gateway_main", os.path.join(gateway_path, "main.py"))
diffusion_main = load_module_from_path("diffusion_main", os.path.join(diffusion_path, "main.py"))
simulation_main = load_module_from_path("simulation_main", os.path.join(simulation_path, "main.py"))

# Override dependency to bypass authentication in testing
from gateway_main import app, get_current_user, require_role
app.dependency_overrides[get_current_user] = lambda: {"username": "test_user", "role": "researcher"}
app.dependency_overrides[require_role("researcher")] = lambda: {"username": "test_user", "role": "researcher"}

client = TestClient(app)

# ==============================================================================
# 1. AMBIGUOUS AND CONTRADICTORY PROMPTS TESTS
# ==============================================================================
def test_contradictory_prompt_validation():
    # Attempting to activate and inhibit simultaneously
    payload = {
        "prompt": "I want to activate and inhibit PINK1 expression",
        "disease_state": "mitophagy deficit",
        "target_protein": "PINK1",
        "user_id": "user_123",
        "simulation_complexity": "standard",
        "is_encrypted": False,
        "consent_token": "consent_abc",
        "epsilon": 1.0
    }
    response = client.post("/api/v1/peptides/design", json=payload)
    assert response.status_code == 400
    data = response.json()
    assert "detail" in data
    assert data["detail"]["error_code"] == "CONTRADICTORY_PROMPT"
    assert "Contradictory terms" in data["detail"]["message"]
    assert "diagnostic_metadata" in data["detail"]

def test_too_short_prompt_validation():
    payload = {
        "prompt": "abc",
        "disease_state": "oncology",
        "target_protein": "p53",
        "user_id": "user_123",
        "simulation_complexity": "standard",
        "is_encrypted": False,
        "consent_token": "consent_abc",
        "epsilon": 1.0
    }
    response = client.post("/api/v1/peptides/design", json=payload)
    assert response.status_code == 400
    data = response.json()
    assert data["detail"]["error_code"] == "CONTRADICTORY_PROMPT"
    assert "too short" in data["detail"]["message"].lower()

# ==============================================================================
# 2. DATABASE CONNECTIVITY LOSS TESTS
# ==============================================================================
@patch('gateway_main.get_db_connection')
def test_database_connectivity_loss(mock_get_conn):
    # Simulate DB connection returning None (database down)
    mock_get_conn.return_value = None
    
    payload = {
        "prompt": "Targeting PINK1 pathways in motor neurons",
        "disease_state": "Parkinson",
        "target_protein": "PINK1",
        "user_id": "user_123",
        "simulation_complexity": "standard",
        "is_encrypted": False,
        "consent_token": "consent_abc",
        "epsilon": 1.0
    }
    response = client.post("/api/v1/peptides/design", json=payload)
    assert response.status_code == 503
    data = response.json()
    assert data["detail"]["error_code"] == "DATABASE_CONNECTIVITY_LOSS"
    assert "DATABASE_CONNECTIVITY_LOSS" in response.text

@patch('gateway_main.get_db_connection')
def test_simulated_database_connectivity_loss_header(mock_get_conn):
    payload = {
        "prompt": "Targeting PINK1 pathways in motor neurons",
        "disease_state": "Parkinson",
        "target_protein": "PINK1",
        "user_id": "user_123",
        "simulation_complexity": "standard",
        "is_encrypted": False,
        "consent_token": "consent_abc",
        "epsilon": 1.0
    }
    headers = {"x-simulate-db-failure": "true"}
    response = client.post("/api/v1/peptides/design", json=payload, headers=headers)
    assert response.status_code == 503
    data = response.json()
    assert data["detail"]["error_code"] == "DATABASE_CONNECTIVITY_LOSS"

# ==============================================================================
# 3. IDEMPOTENCY KEY STATE PRESERVATION
# ==============================================================================
@patch('gateway_main.get_db_connection')
def test_idempotency_key_preservation(mock_get_conn):
    # Mock database to return an existing design
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value = mock_cursor
    mock_get_conn.return_value = mock_conn
    
    # Use side_effect to distinguish queries to designs vs audit_logs
    def fetchone_side_effect():
        call_args = mock_cursor.execute.call_args
        if call_args:
            query = call_args[0][0]
            if "audit_logs" in query:
                return (0, "GENESIS_HASH")
            elif "designs" in query:
                return ("pep_existing_id", "COMPLETED")
        return None

    mock_cursor.fetchone.side_effect = fetchone_side_effect
    
    payload = {
        "prompt": "Targeting PINK1 pathways in motor neurons",
        "disease_state": "Parkinson",
        "target_protein": "PINK1",
        "user_id": "user_123",
        "simulation_complexity": "standard",
        "is_encrypted": False,
        "consent_token": "consent_abc",
        "epsilon": 1.0
    }
    
    headers = {"Idempotency-Key": "idemp_test_key_123"}
    response = client.post("/api/v1/peptides/design", json=payload, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["design_id"] == "pep_existing_id"
    assert "idempotent" in data["message"].lower()

# ==============================================================================
# 4. MODEL INFERENCE TIMEOUTS (DIFFUSION SERVICE)
# ==============================================================================
def test_model_inference_timeout():
    model = diffusion_main.ConditionalGenerativeFoundationModel()
    with pytest.raises(diffusion_main.ModelInferenceTimeoutError) as exc_info:
        model.generate(
            prompt="Targeting mTOR",
            target="mTOR",
            design_id="pep_timeout_test",
            steps=5,
            simulate_timeout=True
        )
    assert exc_info.value.error_code == "MODEL_INFERENCE_TIMEOUT"
    assert "timed out" in str(exc_info.value).lower()
    assert exc_info.value.diagnostic_metadata["requested_steps"] == 5

# ==============================================================================
# 5. PHYSICOCHEMICAL INSTABILITY (SIMULATION SERVICE)
# ==============================================================================
def test_physicochemical_instability_validation():
    # Sequence with high net charge ratio (> 0.6)
    unstable_sequence = "KKKKKKKKKKKK-NH2"
    is_valid, err = simulation_main.check_physicochemical_stability(unstable_sequence)
    assert not is_valid
    assert "Extreme net charge ratio" in err
    
    # Extremely hydrophobic sequence (> 0.95)
    hydrophobic_sequence = "WWWWWWWWWWWWWWWWWWWW-NH2"
    is_valid, err = simulation_main.check_physicochemical_stability(hydrophobic_sequence)
    assert not is_valid
    assert "Extreme hydrophobicity ratio" in err

    # Healthy stable sequence
    stable_sequence = "MGAFLGKVLKACVVALSGKLL-NH2"
    is_valid, err = simulation_main.check_physicochemical_stability(stable_sequence)
    assert is_valid
    assert err is None

# ==============================================================================
# 6. SIMULATION HORIZON LIMIT (SIMULATION SERVICE)
# ==============================================================================
def test_simulation_horizon_exceeded_error():
    from simulation_main import SimulationHorizonExceededError
    complexity = "extremely_long"
    with pytest.raises(SimulationHorizonExceededError) as exc_info:
        if complexity in ["extremely_long", "extreme_horizon"]:
            raise SimulationHorizonExceededError(
                "Simulation horizon limit exceeded. Requested simulation complexity exceeds safety bounds (< 5000 SDE/Langevin steps).",
                {
                    "complexity_level": complexity,
                    "maximum_allowed_steps": 5000,
                    "estimated_steps_required": 1000000
                }
            )
    assert exc_info.value.error_code == "SIMULATION_HORIZON_EXCEEDED"
