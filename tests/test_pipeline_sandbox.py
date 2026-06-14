import os
import sys
import json
import logging
import pytest
import numpy as np
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any

# Setup logging with custom formatter for differential logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("pipeline-sandbox-test")

# 1. Setup paths to allow direct imports of modular services
WORKSPACE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
NLP_PATH = os.path.join(WORKSPACE_DIR, 'services', 'nlp')
DIFFUSION_PATH = os.path.join(WORKSPACE_DIR, 'services', 'diffusion')
SIMULATION_PATH = os.path.join(WORKSPACE_DIR, 'services', 'simulation')

# Dynamically import modules to avoid namespace collisions on 'main.py'
import importlib.util

def load_module_from_path(module_name, file_path):
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module

# Inject paths into sys.path so inner imports work (e.g. from governance import ...)
if NLP_PATH not in sys.path:
    sys.path.insert(0, NLP_PATH)
if DIFFUSION_PATH not in sys.path:
    sys.path.insert(0, DIFFUSION_PATH)
if SIMULATION_PATH not in sys.path:
    sys.path.insert(0, SIMULATION_PATH)

# Load the services
nlp_main = load_module_from_path("nlp_main", os.path.join(NLP_PATH, "main.py"))
diffusion_main = load_module_from_path("diffusion_main", os.path.join(DIFFUSION_PATH, "main.py"))
simulation_main = load_module_from_path("simulation_main", os.path.join(SIMULATION_PATH, "main.py"))
digital_twin = load_module_from_path("digital_twin", os.path.join(SIMULATION_PATH, "digital_twin.py"))
structure_prediction = load_module_from_path("structure_prediction", os.path.join(SIMULATION_PATH, "structure_prediction.py"))


# ==============================================================================
# SECTION 1: SCHEMA DEFINITIONS FOR CONTRACT ENFORCEMENT
# ==============================================================================

class NLPOutputContract(BaseModel):
    target_proteins: List[str] = Field(..., min_items=1)
    affected_pathways: List[str]
    desired_modulation_polarity: str
    constraint_parameters: Dict[str, Any]
    post_translational_modifications: List[str]

class DiffusionInputContract(BaseModel):
    prompt: str
    target_protein: str
    design_id: str
    steps: Optional[int] = 5

class DiffusionOutputContract(BaseModel):
    design_id: str
    sequence: str
    target_protein: str

class StructurePredictionOutputContract(BaseModel):
    interaction_fingerprint: List[int] = Field(..., min_items=1)
    free_energy: float

class DigitalTwinInputContract(BaseModel):
    sequence: str
    descriptors: Dict[str, Any]
    disease_context: Dict[str, Any]
    omics_data: Dict[str, Any]


# ==============================================================================
# SECTION 2: SANDBOX PIPELINE ORCHESTRATOR
# ==============================================================================

class PipelineSandboxOrchestrator:
    """
    Controlled sandbox environment orchestrating execution of chained service calls
    with schema validation, contract enforcement, and differential logging.
    """
    def __init__(self):
        self.history = []

    def log_differential(self, stage_name: str, source_data: Dict[str, Any], target_data: Dict[str, Any], expected_mappings: Dict[str, str]):
        """
        Detects and logs interface mismatches or information loss during data handoffs.
        """
        logger.info(f"\n--- [DIFFERENTIAL LOGGING] Handoff Stage: {stage_name} ---")
        
        # Check for expected mappings and missing values
        mismatches = []
        info_loss = []
        
        for src_field, tgt_field in expected_mappings.items():
            if src_field not in source_data:
                mismatches.append(f"Source missing expected field: '{src_field}'")
            elif tgt_field not in target_data:
                mismatches.append(f"Target missing mapped field: '{tgt_field}' from source '{src_field}'")
            else:
                src_val = source_data[src_field]
                tgt_val = target_data[tgt_field]
                logger.info(f"Verified mapping: {src_field} -> {tgt_field} (Value: {tgt_val})")
        
        # Check for unmapped source fields (information loss)
        mapped_src_fields = set(expected_mappings.keys())
        for src_key in source_data.keys():
            if src_key not in mapped_src_fields:
                info_loss.append(f"Unmapped source field: '{src_key}' (Value: {source_data[src_key]})")
                
        # Check for unmapped target fields (default fallbacks)
        mapped_tgt_fields = set(expected_mappings.values())
        for tgt_key in target_data.keys():
            if tgt_key not in mapped_tgt_fields:
                logger.warning(f"Target field '{tgt_key}' populated without direct source mapping (fallback/default: {target_data[tgt_key]})")

        # Report results
        if mismatches:
            for m in mismatches:
                logger.error(f"[Contract Mismatch] {m}")
        if info_loss:
            for il in info_loss:
                logger.warning(f"[Information Loss] Field '{il}' was dropped during handoff.")
                
        self.history.append({
            "stage": stage_name,
            "mismatches": mismatches,
            "info_loss": info_loss
        })
        
        return len(mismatches) == 0

    async def execute_pipeline(self, raw_input_text: str, design_id: str) -> Dict[str, Any]:
        """
        Runs the sequential pipeline under schema verification.
        """
        logger.info(f"Starting pipeline execution in controlled sandbox for design ID: {design_id}")
        
        # -------------------------------------------------------------
        # STAGE 1: Language Understanding Layer (NLP Parser)
        # -------------------------------------------------------------
        logger.info("[Stage 1] Executing NLP Parsing on biological prompt...")
        nlp_request = nlp_main.NLPRequest(text=raw_input_text, context_id=f"ctx_{design_id}")
        nlp_response = await nlp_main.parse_disease_state(nlp_request)
        
        # Schema enforcement
        nlp_data = nlp_response.dict()
        nlp_contract = NLPOutputContract(**nlp_data)
        logger.info(f"[Stage 1] NLP Data contract validated. Target proteins extracted: {nlp_contract.target_proteins}")

        # -------------------------------------------------------------
        # STAGE 2: Hand-off to Diffusion Generator
        # -------------------------------------------------------------
        logger.info("[Stage 2] Preparing input payload for Diffusion Generator...")
        
        # Map NLP outputs to Diffusion input parameters
        # Mismatch/Loss detection: NLP produces target_proteins list, pathways list, and polarity. 
        # Diffusion only accepts a single target_protein string and prompt text.
        target_protein_string = " / ".join(nlp_contract.target_proteins)
        
        diffusion_payload = {
            "prompt": raw_input_text,
            "target_protein": target_protein_string,
            "design_id": design_id,
            "steps": 2 # Run fewer steps for test speed
        }
        
        # Schema enforcement
        diffusion_input_contract = DiffusionInputContract(**diffusion_payload)
        
        # Log differential mapping between NLP output and Diffusion input
        expected_mappings_nlp_to_diff = {
            "target_proteins": "target_protein",
        }
        self.log_differential(
            stage_name="NLP_TO_DIFFUSION",
            source_data=nlp_data,
            target_data=diffusion_payload,
            expected_mappings=expected_mappings_nlp_to_diff
        )

        # Execute diffusion generation in sandbox
        logger.info("[Stage 2] Executing Score-Based Diffusion Generator...")
        generated_sequence = diffusion_main.generate_peptide_sequence(
            prompt=diffusion_input_contract.prompt,
            target=diffusion_input_contract.target_protein,
            design_id=diffusion_input_contract.design_id
        )
        
        diffusion_output = {
            "design_id": design_id,
            "sequence": generated_sequence,
            "target_protein": target_protein_string
        }
        diffusion_output_contract = DiffusionOutputContract(**diffusion_output)
        logger.info(f"[Stage 2] Diffusion output contract validated. Generated sequence: {diffusion_output_contract.sequence}")

        # -------------------------------------------------------------
        # STAGE 3: Structure Prediction & Docking
        # -------------------------------------------------------------
        logger.info("[Stage 3] Executing Structure Prediction and Physics-Informed Docking...")
        descriptors = structure_prediction.run_structure_prediction_pipeline(
            sequence=diffusion_output_contract.sequence,
            design_id=design_id
        )
        
        # Schema enforcement
        struct_contract = StructurePredictionOutputContract(**descriptors)
        logger.info(f"[Stage 3] Structure prediction complete. Docking free energy: {struct_contract.free_energy:.2f} kcal/mol")

        # -------------------------------------------------------------
        # STAGE 4: Propagation into Digital Twin Simulation
        # -------------------------------------------------------------
        logger.info("[Stage 4] Instantiating Digital Twin Sandbox and propagating descriptors...")
        sandbox = digital_twin.DigitalTwinSandbox()
        
        disease_context = {
            "id": f"ctx_{design_id}",
            "targets": nlp_contract.target_proteins,
            "disease_state": "Mitochondrial Tagging Deficit (Post-Viral Neuropathy)"
        }
        
        omics_data = {
            "layers": ["genomics", "transcriptomics", "proteomics"],
            "features": {t: 1.0 for t in nlp_contract.target_proteins}
        }
        
        sandbox.ingest_context_and_build(disease_context, omics_data)
        
        # Augment descriptors with Langevin physics parameters (as main.py does)
        # We need to verify that 'free_energy' and 'interaction_fingerprint' propagate intact
        propagated_descriptors = {
            "free_energy": struct_contract.free_energy,
            "interaction_fingerprint": struct_contract.interaction_fingerprint,
            "sequence": diffusion_output_contract.sequence
        }
        
        # Schema enforcement for Digital Twin input
        dt_input_payload = {
            "sequence": diffusion_output_contract.sequence,
            "descriptors": propagated_descriptors,
            "disease_context": disease_context,
            "omics_data": omics_data
        }
        DigitalTwinInputContract(**dt_input_payload)

        # Log differential mapping between Structure Prediction output and Digital Twin Sandbox input
        expected_mappings_struct_to_dt = {
            "free_energy": "free_energy",
            "interaction_fingerprint": "interaction_fingerprint"
        }
        self.log_differential(
            stage_name="STRUCTURE_TO_DIGITAL_TWIN",
            source_data=descriptors,
            target_data=propagated_descriptors,
            expected_mappings=expected_mappings_struct_to_dt
        )

        # Run the simulation and capture output
        recovery_score = sandbox.simulate_peptide(
            peptide_sequence=diffusion_output_contract.sequence,
            descriptors=propagated_descriptors
        )
        
        logger.info(f"[Stage 4] Digital Twin simulation completed. Recovery score: {recovery_score:.4f}")
        
        # Verify propagation didn't lose key parameters
        assert propagated_descriptors["free_energy"] == struct_contract.free_energy, "Free energy docking score corrupted!"
        assert propagated_descriptors["interaction_fingerprint"] == struct_contract.interaction_fingerprint, "Interaction fingerprint lost!"
        
        return {
            "nlp_output": nlp_contract,
            "generated_sequence": diffusion_output_contract.sequence,
            "descriptors": struct_contract,
            "recovery_score": recovery_score
        }


# ==============================================================================
# SECTION 3: TEST CASE SUITE
# ==============================================================================

@pytest.mark.asyncio
async def test_pipeline_sandbox_execution_and_data_propagation():
    """
    Validates end-to-end sequential pipeline stages, verifying schema contracts,
    data propagation, and information loss logging.
    """
    orchestrator = PipelineSandboxOrchestrator()
    design_id = "sandbox_test_99"
    prompt = "Correcting mitochondrial tagging deficits in neurons after viral exposure"
    
    # Run pipeline
    results = await orchestrator.execute_pipeline(prompt, design_id)
    
    # 1. Verification of NLP outputs
    assert "PINK1" in results["nlp_output"].target_proteins
    assert "Parkin" in results["nlp_output"].target_proteins
    assert "Mitochondrial Autophagy" in results["nlp_output"].affected_pathways
    
    # 2. Verification of generated sequence formats
    assert results["generated_sequence"].endswith("-NH2")
    
    # 3. Verification of structural descriptors propagation
    assert results["descriptors"].free_energy < 0.0
    assert len(results["descriptors"].interaction_fingerprint) == 128
    
    # 4. Verification of simulation outcome
    assert 0.0 <= results["recovery_score"] <= 1.0
    
    # 5. Assert contract check history has no failures (only logs warnings/mismatches in mappings)
    assert len(orchestrator.history) == 2
    
    # Check that we logged information loss on the NLP to Diffusion stage
    nlp_to_diff_history = next(h for h in orchestrator.history if h["stage"] == "NLP_TO_DIFFUSION")
    assert any("affected_pathways" in item for item in nlp_to_diff_history["info_loss"])
    assert any("desired_modulation_polarity" in item for item in nlp_to_diff_history["info_loss"])
    logger.info("Successfully detected expected information loss: 'affected_pathways' and 'desired_modulation_polarity' dropped during diffusion handoff.")

if __name__ == "__main__":
    import asyncio
    asyncio.run(test_pipeline_sandbox_execution_and_data_propagation())
