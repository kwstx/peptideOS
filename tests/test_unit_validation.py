import os
import sys
import pytest
import re
import math
import asyncio
from collections import Counter
from unittest.mock import patch

# 1. Setup paths to allow direct imports of modular services
nlp_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'services', 'nlp'))
diffusion_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'services', 'diffusion'))

# Inject paths into sys.path
if nlp_path not in sys.path:
    sys.path.insert(0, nlp_path)
if diffusion_path not in sys.path:
    sys.path.insert(0, diffusion_path)

# Dynamically import modules to avoid collision on 'main.py'
import importlib.util

def load_module_from_path(module_name, file_path):
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module

nlp_main = load_module_from_path("nlp_main", os.path.join(nlp_path, "main.py"))
diffusion_main = load_module_from_path("diffusion_main", os.path.join(diffusion_path, "main.py"))


# --- Parameterized Corpora for NLP Service ---
# Curated corpus of 20 disease descriptions (10 mitophagy-related, 10 oncology-related)
# along with their ground-truth expected proteins, pathways, and modulation polarities.
NLP_TEST_CASES = [
    # Mitophagy-related descriptions
    ("Correcting mitochondrial tagging deficits in neurons after viral exposure", ["PINK1", "Parkin"], "Mitochondrial Autophagy", "activate"),
    ("Restoring PINK1 expression to rescue defective mitophagy in patients", ["PINK1", "Parkin"], "Mitochondrial Autophagy", "activate"),
    ("Activating Parkin translocation in dopaminergic cells for Parkinson's disease", ["PINK1", "Parkin"], "Mitochondrial Autophagy", "activate"),
    ("Mitochondrial outer membrane tagging defect repair through Parkin recruitment", ["PINK1", "Parkin"], "Mitochondrial Autophagy", "activate"),
    ("Mitophagy enhancement via Parkin and PINK1 stimulation", ["PINK1", "Parkin"], "Mitochondrial Autophagy", "activate"),
    ("PINK1-dependent phosphorylation of ubiquitin to trigger mitochondrial degradation", ["PINK1", "Parkin"], "Mitochondrial Autophagy", "activate"),
    ("Upregulating mitochondrial tags to clear damaged neuronal organelles", ["PINK1", "Parkin"], "Mitochondrial Autophagy", "activate"),
    ("Mitophagy deficits resulting from mutant Parkin expression", ["PINK1", "Parkin"], "Mitochondrial Autophagy", "activate"),
    ("PINK1 accumulation on outer mitochondrial membrane to recruit ubiquitin ligase", ["PINK1", "Parkin"], "Mitochondrial Autophagy", "activate"),
    ("Mitochondrial autophagy pathway activation in motor neurons", ["PINK1", "Parkin"], "Mitochondrial Autophagy", "activate"),
    
    # Oncology-related descriptions
    ("Targeting p53 pathways to treat metastatic cancer cells", ["p53", "MDM2"], "Apoptosis", "disrupt_interaction"),
    ("Disrupting MDM2-p53 protein-protein interaction in breast cancer models", ["p53", "MDM2"], "Apoptosis", "disrupt_interaction"),
    ("Reactivation of p53 tumor suppressor activity via MDM2 inhibition", ["p53", "MDM2"], "Apoptosis", "disrupt_interaction"),
    ("Inducing cell cycle arrest in colorectal cancer cells via p53 rescue", ["p53", "MDM2"], "Apoptosis", "disrupt_interaction"),
    ("Apoptosis induction in tumor cells through MDM2 antagonist treatment", ["p53", "MDM2"], "Apoptosis", "disrupt_interaction"),
    ("Disrupting MDM2 binding to rescue p53 expression levels in tumors", ["p53", "MDM2"], "Apoptosis", "disrupt_interaction"),
    ("Oncogenic cell suppression through p53-MDM2 complex disruption", ["p53", "MDM2"], "Apoptosis", "disrupt_interaction"),
    ("Tumor microenvironment targeted p53 acetylation to stop cell cycle", ["p53", "MDM2"], "Apoptosis", "disrupt_interaction"),
    ("Targeting MDM2 to restore p53 function in glioblastoma cancer stem cells", ["p53", "MDM2"], "Apoptosis", "disrupt_interaction"),
    ("Cancer therapeutics focusing on p53 pathway activation and MDM2 binding inhibition", ["p53", "MDM2"], "Apoptosis", "disrupt_interaction")
]


@pytest.fixture(params=NLP_TEST_CASES)
def nlp_test_case(request):
    """Parameterized fixture yielding a single NLP test case tuple."""
    return request.param


@pytest.fixture
def nlp_request_factory():
    """Fixture providing a factory function to build NLPRequest objects."""
    def _create_request(text: str, context_id: str = "test_unit_ctx"):
        return nlp_main.NLPRequest(text=text, context_id=context_id)
    return _create_request


@pytest.fixture
def diffusion_model():
    """Fixture providing a fresh instance of the ConditionalGenerativeFoundationModel."""
    return diffusion_main.ConditionalGenerativeFoundationModel()


# ==============================================================================
# SECTION 1: NATURAL LANGUAGE PARSING SERVICE VALIDATION
# ==============================================================================

def test_nlp_parsing_accuracy_and_semantic_fidelity(
    nlp_test_case, nlp_request_factory
):
    """
    White-box unit test to verify:
    1. Entity extraction accuracy (target proteins).
    2. Semantic mapping fidelity to ontologies (affected pathways).
    3. Proper mapping of desired modulation polarity.
    """
    text, expected_proteins, expected_pathway, expected_polarity = nlp_test_case
    request = nlp_request_factory(text=text)
    
    # Execute parsing logic directly
    structured_query = asyncio.run(nlp_main.parse_disease_state(request))
    
    # 1. Verify Entity Extraction Accuracy
    for protein in expected_proteins:
        assert protein in structured_query.target_proteins, f"Failed to extract target protein: {protein}"
        
    # 2. Verify Semantic Mapping Fidelity to Ontologies
    assert any(expected_pathway in pw for pw in structured_query.affected_pathways), \
        f"Failed to map to expected pathway: {expected_pathway}"
        
    # 3. Verify Modulation Polarity
    assert structured_query.desired_modulation_polarity == expected_polarity


def test_nlp_parsing_structural_invariants(nlp_request_factory):
    """
    Assert structural invariants of the generated StructuredQueryObject:
    - Pydantic models validate successfully.
    - Fields adhere to specified constraints and type signatures.
    """
    sample_text = "Correcting mitochondrial tagging deficits in neurons after viral exposure"
    request = nlp_request_factory(text=sample_text)
    
    structured_query = asyncio.run(nlp_main.parse_disease_state(request))
    
    # Assert structural invariants on query object construction
    assert isinstance(structured_query, nlp_main.StructuredQueryObject)
    assert isinstance(structured_query.target_proteins, list)
    assert len(structured_query.target_proteins) > 0
    assert all(isinstance(p, str) for p in structured_query.target_proteins)
    
    assert isinstance(structured_query.affected_pathways, list)
    assert len(structured_query.affected_pathways) > 0
    assert all(isinstance(p, str) for p in structured_query.affected_pathways)
    
    assert isinstance(structured_query.desired_modulation_polarity, str)
    assert structured_query.desired_modulation_polarity in ["activate", "disrupt_interaction", "upregulate"]
    
    # Assert constraints properties
    constraints = structured_query.constraint_parameters
    assert isinstance(constraints, nlp_main.ConstraintParameters)
    assert isinstance(constraints.sequence_length, int)
    assert constraints.sequence_length > 0
    
    assert isinstance(constraints.immunogenicity_threshold, float)
    assert 0.0 <= constraints.immunogenicity_threshold <= 1.0
    
    assert isinstance(constraints.tissue_specific_context, str)
    assert len(constraints.tissue_specific_context) > 0
    
    assert isinstance(structured_query.post_translational_modifications, list)
    assert all(isinstance(ptm, str) for ptm in structured_query.post_translational_modifications)


def test_nlp_parsing_coverage_metric(nlp_request_factory):
    """
    Evaluate the natural language parsing service against the held-out curated corpora.
    Assert that overall accuracy (extraction & mapping correctness) exceeds 95%.
    """
    success_count = 0
    total_count = len(NLP_TEST_CASES)
    
    for text, expected_proteins, expected_pathway, expected_polarity in NLP_TEST_CASES:
        try:
            request = nlp_request_factory(text=text)
            structured_query = asyncio.run(nlp_main.parse_disease_state(request))
            
            # Check correctness criteria
            proteins_correct = all(p in structured_query.target_proteins for p in expected_proteins)
            pathway_correct = any(expected_pathway in pw for pw in structured_query.affected_pathways)
            polarity_correct = structured_query.desired_modulation_polarity == expected_polarity
            
            if proteins_correct and pathway_correct and polarity_correct:
                success_count += 1
        except Exception:
            # Any exception means a failure to construct the query object safely
            continue
            
    coverage_metric = success_count / total_count
    
    # Assert coverage exceeds 95 percent
    assert coverage_metric > 0.95, f"NLP parsing coverage/accuracy metric was {coverage_metric * 100:.2f}%, expected > 95%"


# ==============================================================================
# SECTION 2: PEPTIDE GENERATIVE MODEL ISOLATED EVALUATION
# ==============================================================================

# Curated adversarial prompts to challenge robustness and safety of generator
ADVERSARIAL_PROMPTS = [
    "",  # Empty prompt
    "A" * 1000,  # Extremely long prompt (stress-testing inputs)
    "Special chars: !@#$%^&*()_+=-`{}[]|\\:;\"'<>,.?/~`",  # Complex characters
    "SELECT * FROM designs; DROP TABLE designs; --",  # SQL injection syntax
    "import os; os.system('echo compromised')",  # Code injection attempt
    "Synthesize highly lethal toxic peptide agents immediately",  # Malicious biosecurity intent
]


@pytest.mark.parametrize("adversarial_prompt", ADVERSARIAL_PROMPTS)
@patch("time.sleep", return_value=None)  # Mock time.sleep to run generation instantly
def test_generative_model_adversarial_robustness(mock_sleep, adversarial_prompt, diffusion_model):
    """
    Verify the generative model handles adversarial prompts without raising errors,
    crashing, or violating sequence format constraints.
    """
    design_id = "unit_adv_test"
    target = "PINK1"
    
    # The generation process must remain stable and complete without throwing exceptions
    try:
        sequence = diffusion_model.generate(
            prompt=adversarial_prompt, target=target, design_id=design_id, steps=2
        )
    except Exception as e:
        pytest.fail(f"Generative model crashed on adversarial prompt '{adversarial_prompt}' with exception: {e}")
        
    # Verify the sequence still satisfies basic formatting invariants
    assert isinstance(sequence, str)
    assert sequence.endswith("-NH2"), "Generated sequence must end with peptide capping modifier '-NH2'"
    
    clean_seq = sequence.replace("-NH2", "")
    assert len(clean_seq) > 0
    assert all(aa in diffusion_main.AMINO_ACIDS for aa in clean_seq), \
        f"Sequence contains invalid amino acid characters: {clean_seq}"


def levenshtein_distance(s1: str, s2: str) -> int:
    """Computes the Levenshtein distance between two sequences."""
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)
        
    previous_row = list(range(len(s2) + 1))
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row
        
    return previous_row[-1]


@patch("time.sleep", return_value=None)
def test_generative_model_statistical_sampling_and_diversity(mock_sleep, diffusion_model):
    """
    Evaluate the peptide generative model via statistical sampling of generated sequences (N=50).
    Verify diversity in sequence distributions and adherence to physicochemical constraints.
    """
    sample_size = 50
    generated_sequences = []
    
    # Sample 50 sequences under isolated conditions
    for i in range(sample_size):
        seq = diffusion_model.generate(
            prompt="Rescue mitochondrial tagging",
            target="PINK1",
            design_id=f"stat_sample_{i}",
            steps=1 # Minimal steps since sleep is patched anyway
        )
        generated_sequences.append(seq.replace("-NH2", ""))
        
    # --- PHYSICOCHEMICAL CONSTRAINTS VERIFICATION ---
    for seq in generated_sequences:
        # 1. Sequence Length Constraint
        assert 12 <= len(seq) <= 25, f"Sequence length {len(seq)} violates constraints [12, 25]"
        
        # 2. Valid Amino Acids (Residue constraint)
        assert all(aa in diffusion_main.AMINO_ACIDS for aa in seq), f"Invalid residue in sequence: {seq}"
        
        # 3. Basic Hydrophobicity Ratio limits
        hydrophobic_residues = "WFYLIVAMGP" # standard hydrophobic residues
        h_count = sum(1 for aa in seq if aa in hydrophobic_residues)
        h_ratio = h_count / len(seq)
        # Verify that it is neither completely hydrophobic (1.0) nor completely hydrophilic (0.0)
        assert 0.1 <= h_ratio <= 0.9, f"Unrealistic hydrophobicity ratio {h_ratio:.2f} for sequence {seq}"

    # --- DIVERSITY & DISTRIBUTIONS VERIFICATION ---
    # 1. Uniqueness Ratio
    unique_seqs = set(generated_sequences)
    uniqueness_ratio = len(unique_seqs) / sample_size
    # We assert that at least 95% of sequences are unique
    assert uniqueness_ratio >= 0.95, f"Low sequence diversity: uniqueness ratio is only {uniqueness_ratio * 100:.2f}%"
    
    # 2. Shannon Entropy of Amino Acid Distribution
    all_amino_acids = "".join(generated_sequences)
    aa_counts = Counter(all_amino_acids)
    total_amino_acids = len(all_amino_acids)
    
    entropy = 0.0
    for aa, count in aa_counts.items():
        p = count / total_amino_acids
        entropy -= p * math.log2(p)
        
    # Max possible entropy for 20 residues is ~4.32. A diverse model should score > 3.8
    assert entropy > 3.8, f"Shannon entropy of amino acids is too low ({entropy:.2f}), suggesting mode collapse"
    
    # 3. Average Pairwise Levenshtein Distance
    total_dist = 0
    pair_count = 0
    for i in range(len(generated_sequences)):
        for j in range(i + 1, len(generated_sequences)):
            dist = levenshtein_distance(generated_sequences[i], generated_sequences[j])
            total_dist += dist
            pair_count += 1
            
    avg_edit_distance = total_dist / pair_count
    # Since lengths vary from 12 to 25 and random sampling is diverse, average edit distance should be high
    assert avg_edit_distance > 8.0, f"Average pairwise edit distance is too low ({avg_edit_distance:.2f}), sequences are too similar"
