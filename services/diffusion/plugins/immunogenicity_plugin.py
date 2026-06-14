import re
from typing import Dict, Any
from plugins import BasePeptidePlugin

class ImmunogenicityPenalizerPlugin(BasePeptidePlugin):
    """
    Custom extension plugin that screens generated sequences for highly immunogenic motifs
    (e.g., MHC-II high-affinity binding cores) and applies a penalty to the generative reward.
    """
    def __init__(self):
        super().__init__(name="ImmunogenicityPenalizer")
        # Example immunogenic epitopes or high-risk sequences (e.g. allergen markers)
        self.high_risk_patterns = [
            r"KKK",  # Dense basic charge clusters
            r"W.*W",  # Aromatic hydrophobic spacing
            r"DE.*ED", # Acidic clusters triggering immunogenic cascades
        ]

    def evaluate_reward(self, sequence: str, latent_state: Any) -> float:
        """
        Calculates an immunogenicity penalty. Returns negative reward for immunogenic sequences,
        and 0.0 if clean.
        """
        # Strip NH2 suffix
        clean_seq = sequence.replace("-NH2", "").replace(" ", "").upper()
        
        matches = 0
        for pattern in self.high_risk_patterns:
            if re.search(pattern, clean_seq):
                matches += 1
                
        # Apply a penalty of -2.5 per matching motif
        penalty = -2.5 * matches
        return float(penalty)

    def get_metrics(self, sequence: str, latent_state: Any) -> Dict[str, float]:
        clean_seq = sequence.replace("-NH2", "").replace(" ", "").upper()
        
        # Calculate ratio of hydrophobic residues (W, F, Y, L, I, V) which affect MHC-II binding
        hydrophobic_count = sum(1 for aa in clean_seq if aa in "WFYLIV")
        seq_len = len(clean_seq) if len(clean_seq) > 0 else 1
        hydrophobic_ratio = hydrophobic_count / seq_len
        
        # Estimated immunogenicity score (0.0 = low risk, 1.0 = high risk)
        # Higher hydrophobic content often correlates with core binding pockets
        base_score = 0.15 + (hydrophobic_ratio * 0.5)
        
        # Adjust for matches
        for pattern in self.high_risk_patterns:
            if re.search(pattern, clean_seq):
                base_score = min(1.0, base_score + 0.25)
                
        return {
            "immunogenicity_risk_score": float(base_score),
            "hydrophobic_ratio": float(hydrophobic_ratio)
        }
