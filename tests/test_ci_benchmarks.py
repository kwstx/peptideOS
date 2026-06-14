import os
import sys
import json
import unittest
import numpy as np

# Set up paths to access services
diffusion_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'services', 'diffusion'))
simulation_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'services', 'simulation'))

# Save original path
original_path = list(sys.path)

# 1. Import Diffusion components
sys.path.insert(0, diffusion_path)
sys.modules.pop('main', None)
sys.modules.pop('governance', None)
try:
    from main import ConditionalGenerativeFoundationModel
    from governance import CryptographicManager, ComplianceValidator, DifferentialPrivacyManager, ProvenanceTracker
    DIFFUSION_SERVICE_AVAILABLE = True
except ImportError as e:
    print("Diffusion import failed:", e)
    DIFFUSION_SERVICE_AVAILABLE = False

# 2. Import Simulation components
sys.path.insert(0, simulation_path)
sys.modules.pop('main', None)
sys.modules.pop('governance', None)
try:
    from main import run_langevin_dynamics_simulation, solve_stochastic_differential_equations
    from efficacy_risk import SequenceFeatureExtractor, EnsembleEfficacyRiskModel
    SIMULATION_SERVICE_AVAILABLE = True
except ImportError as e:
    print("Simulation import failed:", e)
    SIMULATION_SERVICE_AVAILABLE = False

# Restore original path
sys.path = original_path
sys.modules.pop('main', None)
sys.modules.pop('governance', None)


class TestPeptideOSBenchmarks(unittest.TestCase):
    
    def setUp(self):
        # Load the benchmark dataset
        benchmark_path = os.path.join(os.path.dirname(__file__), 'benchmark_datasets', 'peptide_benchmarks.json')
        with open(benchmark_path, 'r') as f:
            self.benchmarks = json.load(f)
            
    def test_imports(self):
        """Ensure all modular components are correctly imported and available."""
        self.assertTrue(DIFFUSION_SERVICE_AVAILABLE, "Diffusion service modules could not be imported.")
        self.assertTrue(SIMULATION_SERVICE_AVAILABLE, "Simulation service modules could not be imported.")

    def test_biosecurity_validation(self):
        """Test biosecurity screening triggers correctly on dual-use select toxin motifs."""
        # Clean sequence (does not contain VVA, TFT, CWD, LFY, KLV)
        is_cleared, violations = ComplianceValidator.screen_biosecurity("MGAFLGKVLKACVALLSGKLL")
        self.assertTrue(is_cleared)
        self.assertEqual(len(violations), 0)
        
        # Toxin sequence (contains 'TFT' - Ricin pattern)
        is_cleared_tox, violations_tox = ComplianceValidator.screen_biosecurity("MGAFLTFTLKACVALLSGKLL")
        self.assertFalse(is_cleared_tox)
        self.assertIn("Ricin Toxin A-Chain", violations_tox[0])

    def test_cryptographic_encryption(self):
        """Test that AES-256-GCM End-to-End Encryption functions correctly."""
        original_payload = {"val": "Correcting mitochondrial tagging deficits"}
        
        # Generate session key
        session_key = CryptographicManager.generate_session_key()
        
        # Encrypt
        encrypted = CryptographicManager.encrypt(original_payload, session_key)
        self.assertNotEqual(encrypted, original_payload["val"])
        
        # Decrypt
        decrypted = CryptographicManager.decrypt(encrypted, session_key)
        self.assertEqual(decrypted["val"], original_payload["val"])

    def test_differential_privacy_laplace_noise(self):
        """Test that Laplace noise perturbation respects epsilon limits."""
        raw_val = -12.4
        sensitivity = 1.0
        
        # Low noise (large epsilon)
        val_low_noise = DifferentialPrivacyManager.inject_laplace_noise(raw_val, sensitivity, epsilon=10.0)
        self.assertAlmostEqual(raw_val, val_low_noise, delta=1.5)
        
        # High noise (small epsilon)
        val_high_noise = DifferentialPrivacyManager.inject_laplace_noise(raw_val, sensitivity, epsilon=0.1)
        # Verify it returns a float
        self.assertIsInstance(val_high_noise, float)

    def test_langevin_and_sde_solvers(self):
        """Test molecular dynamics energy minimizer and signaling SDE solvers."""
        # Run Langevin
        final_energy = run_langevin_dynamics_simulation()
        self.assertIsInstance(final_energy, float)
        self.assertLess(final_energy, 50.0, "Langevin simulation should minimize potential energy.")
        
        # Run SDE Solver
        final_defect = solve_stochastic_differential_equations()
        self.assertIsInstance(final_defect, float)
        self.assertLess(final_defect, 1.0, "SDE Solver should propagate cellular recovery towards target mu.")

    def test_benchmark_suite_execution(self):
        """Run generative and simulation modules on all benchmark dataset prompts."""
        model = ConditionalGenerativeFoundationModel()
        er_model = EnsembleEfficacyRiskModel(significance_level=0.05)
        
        for case in self.benchmarks:
            design_id = f"test_{case['benchmark_id']}"
            prompt = case['prompt']
            target = case['target_protein']
            constraints = case['constraints']
            
            # 1. Test generative diffusion sequence length constraints
            sequence = model.generate(prompt=prompt, target=target, design_id=design_id, steps=2)
            clean_seq = sequence.replace("-NH2", "")
            
            # Check length is positive and non-empty
            self.assertGreater(len(clean_seq), 0)
            
            # 2. Test biosecurity clearance logic
            is_cleared, violations = ComplianceValidator.screen_biosecurity(clean_seq)
            if constraints["biosecurity_clearance_required"]:
                # The random sequence shouldn't hit the toxin blacklist by chance (probability is ~20^3 or 1/8000)
                # But if it does, we just check consistency
                self.assertEqual(is_cleared, constraints["biosecurity_clearance_required"])
                
            # 3. Test Conformal prediction inference
            seq_features = SequenceFeatureExtractor.extract_features(clean_seq)
            struct_metrics = {"free_energy": -12.4, "binding_stability": 0.94, "min_distance": 1.5, "coupling_factor": 1.8}
            trajectory_summaries = {f"{node}_activity_mean": 0.1 for node in ["mTOR", "PINK1", "Parkin", "BAX", "CASP3", "MAPK"]}
            for node in ["mTOR", "PINK1", "Parkin", "BAX", "CASP3"]:
                trajectory_summaries[f"{node}_activity_std"] = 0.02
                
            prediction = er_model.predict(seq_features, struct_metrics, trajectory_summaries)
            
            self.assertIn("therapeutic_index", prediction)
            self.assertIn("conformal_interval", prediction["therapeutic_index"])
            self.assertIn("adverse_events", prediction)
            self.assertIn("adverse_risk_level", prediction["adverse_events"])
            
            # 4. Provenance tracking
            prov_data = ProvenanceTracker.generate_provenance_token(
                prompt=prompt,
                nlp_entities={"disease": case["disease_state"], "target": target},
                diffusion_latent_hash="test_latent_hash",
                simulation_id=f"sim_{design_id}",
                final_sequence=sequence
            )
            self.assertTrue(prov_data["provenance_token"].startswith("prov_"))


if __name__ == '__main__':
    unittest.main()
