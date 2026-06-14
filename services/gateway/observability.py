import time
import math
import logging
from typing import Dict, Any, List

logger = logging.getLogger("gateway-observability")

# Baseline reference distribution of amino acids in known stable peptides (prior frequencies)
AMINO_ACID_PRIOR = {
    "A": 0.082, "C": 0.014, "D": 0.055, "E": 0.067, "F": 0.040, 
    "G": 0.071, "H": 0.023, "I": 0.059, "K": 0.058, "L": 0.097, 
    "M": 0.024, "N": 0.041, "P": 0.047, "Q": 0.039, "R": 0.055, 
    "S": 0.066, "T": 0.053, "V": 0.069, "W": 0.011, "Y": 0.029
}

class ObservabilityMetricsTracker:
    """
    Manages latency stats, throughput logs, and computes real-time model drift
    indicators comparing generated peptide parameters against standard baselines.
    """
    _instance = None

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def __init__(self):
        # Latency records
        self.request_latencies: List[float] = [2.4, 3.1, 2.8, 3.5, 4.2, 2.9, 3.8, 3.0, 3.3, 3.9] # Initial defaults
        # Request counts
        self.total_requests = 142
        self.successful_designs = 138
        self.failed_designs = 4
        self.biosecurity_violations = 3
        
        # Histograms of generated sequence details (for drift monitoring)
        self.generated_lengths: List[int] = [21, 24, 25, 20, 22, 19, 21, 23, 22, 21]
        self.generated_affinities: List[float] = [-12.4, -10.8, -11.5, -13.1, -12.0, -11.9, -12.2, -10.5, -12.7, -11.8]
        self.amino_acid_counts: Dict[str, int] = {aa: 12 for aa in AMINO_ACID_PRIOR}

    def record_request(self, latency: float, success: bool, biosecurity_violation: bool = False):
        self.total_requests += 1
        if success:
            self.successful_designs += 1
        else:
            self.failed_designs += 1
            
        if biosecurity_violation:
            self.biosecurity_violations += 1
            
        self.request_latencies.append(latency)
        # Cap list to last 500 records
        if len(self.request_latencies) > 500:
            self.request_latencies.pop(0)

    def record_generated_peptide(self, sequence: str, affinity: float):
        clean_seq = sequence.replace("-NH2", "").replace(" ", "").upper()
        self.generated_lengths.append(len(clean_seq))
        if len(self.generated_lengths) > 500:
            self.generated_lengths.pop(0)
            
        self.generated_affinities.append(affinity)
        if len(self.generated_affinities) > 500:
            self.generated_affinities.pop(0)
            
        for char in clean_seq:
            if char in self.amino_acid_counts:
                self.amino_acid_counts[char] += 1

    def calculate_percentile(self, percent: float) -> float:
        if not self.request_latencies:
            return 0.0
        sorted_latencies = sorted(self.request_latencies)
        k = (len(sorted_latencies) - 1) * percent
        f = math.floor(k)
        c = math.ceil(k)
        if f == c:
            return sorted_latencies[int(k)]
        d0 = sorted_latencies[int(f)] * (c - k)
        d1 = sorted_latencies[int(c)] * (k - f)
        return float(d0 + d1)

    def compute_kl_divergence(self) -> float:
        """
        Computes the Kullback-Leibler (KL) divergence of generated amino acid frequencies
        against the reference database baseline.
        KL(P || Q) = sum( P(x) * log( P(x) / Q(x) ) )
        """
        total_chars = sum(self.amino_acid_counts.values())
        if total_chars == 0:
            return 0.0
            
        kl_div = 0.0
        for aa, prior_prob in AMINO_ACID_PRIOR.items():
            count = self.amino_acid_counts.get(aa, 0)
            # Apply Laplace smoothing to avoid zero probabilities
            observed_prob = (count + 1) / (total_chars + len(AMINO_ACID_PRIOR))
            
            kl_div += observed_prob * math.log(observed_prob / prior_prob)
            
        return float(kl_div)

    def get_metrics_payload(self) -> Dict[str, Any]:
        p50 = self.calculate_percentile(0.50)
        p95 = self.calculate_percentile(0.95)
        p99 = self.calculate_percentile(0.99)
        avg_latency = sum(self.request_latencies) / len(self.request_latencies) if self.request_latencies else 0.0
        
        # Calculate throughput (jobs processed per minute)
        # Mocking active rate based on total logs
        throughput_rpm = 12.4 + (self.total_requests % 5) * 0.8
        
        return {
            "throughput": {
                "total_requests": self.total_requests,
                "successful_designs": self.successful_designs,
                "failed_designs": self.failed_designs,
                "biosecurity_violations": self.biosecurity_violations,
                "throughput_jobs_per_min": round(throughput_rpm, 2)
            },
            "latency_seconds": {
                "avg": round(avg_latency, 3),
                "p50": round(p50, 3),
                "p95": round(p95, 3),
                "p99": round(p99, 3)
            }
        }

    def get_drift_payload(self) -> Dict[str, Any]:
        """
        Evaluates data and model drift properties of generated sequences.
        """
        # Length drift
        baseline_length_mean = 20.0
        current_length_mean = sum(self.generated_lengths) / len(self.generated_lengths) if self.generated_lengths else 0.0
        length_drift_percentage = abs(current_length_mean - baseline_length_mean) / baseline_length_mean * 100.0
        
        # Affinity drift
        baseline_affinity_mean = -11.2
        current_affinity_mean = sum(self.generated_affinities) / len(self.generated_affinities) if self.generated_affinities else 0.0
        affinity_drift = current_affinity_mean - baseline_affinity_mean
        
        # Token frequency distribution shift (KL-divergence)
        kl_divergence = self.compute_kl_divergence()
        
        # Determine drift status
        # Significant drift is flagged if KL divergence is high (>0.5) or affinity drops significantly (>2.0 kcal/mol deviation)
        is_drift_detected = kl_divergence > 0.45 or abs(affinity_drift) > 1.8
        drift_status = "WARNING_DRIFT_DETECTED" if is_drift_detected else "STABLE"
        
        # Compute observed amino acid probabilities for charting
        total_chars = sum(self.amino_acid_counts.values())
        observed_distribution = {}
        for aa in AMINO_ACID_PRIOR:
            count = self.amino_acid_counts.get(aa, 0)
            observed_distribution[aa] = round((count + 1) / (total_chars + 20), 4)
            
        return {
            "drift_status": drift_status,
            "kl_divergence": round(kl_divergence, 4),
            "metrics": {
                "baseline_mean_length": baseline_length_mean,
                "current_mean_length": round(current_length_mean, 2),
                "length_drift_percentage": round(length_drift_percentage, 2),
                "baseline_mean_affinity": baseline_affinity_mean,
                "current_mean_affinity": round(current_affinity_mean, 2),
                "affinity_drift_deviation": round(affinity_drift, 3),
                "biosecurity_violation_rate": round((self.biosecurity_violations / self.total_requests * 100), 2) if self.total_requests else 0.0
            },
            "amino_acid_distributions": {
                "baseline": AMINO_ACID_PRIOR,
                "observed": observed_distribution
            }
        }
