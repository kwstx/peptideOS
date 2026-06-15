import os
import sys
import json
import numpy as np

WORKSPACE_DIR = r"c:\Users\galan\peptideOS"
SIMULATION_PATH = os.path.join(WORKSPACE_DIR, 'services', 'simulation')
if SIMULATION_PATH not in sys.path:
    sys.path.insert(0, SIMULATION_PATH)

import importlib.util
digital_twin = importlib.util.module_from_spec(
    importlib.util.spec_from_file_location("digital_twin", os.path.join(SIMULATION_PATH, "digital_twin.py"))
)
sys.modules["digital_twin"] = digital_twin
digital_twin.__spec__.loader.exec_module(digital_twin)

def compute_pagerank(adj, personalization=None, d=0.85, max_iter=1000, tol=1e-6):
    n = adj.shape[0]
    row_sums = np.sum(adj, axis=1)
    transition = np.zeros_like(adj)
    for i in range(n):
        if row_sums[i] > 1e-9:
            transition[i, :] = adj[i, :] / row_sums[i]
        else:
            transition[i, :] = 1.0 / n
            
    if personalization is None:
        p = np.ones(n) / n
    else:
        p = np.array(personalization)
        p_sum = np.sum(p)
        if p_sum > 1e-9:
            p = p / p_sum
        else:
            p = np.ones(n) / n
            
    x = np.ones(n) / n
    for _ in range(max_iter):
        x_next = d * np.dot(x, transition) + (1.0 - d) * p
        if np.linalg.norm(x_next - x) < tol:
            return x_next
        x = x_next
    return x

sandbox = digital_twin.DigitalTwinSandbox()
disease_context = {
    "id": "mitophagy_context_val",
    "disease_state": "Mitochondrial Tagging Deficit (Post-Viral Neuropathy)",
    "targets": ["PINK1", "Parkin"]
}
omics_data = {
    "layers": ["proteomics"],
    "features": {
        "PINK1": 1.0,
        "Parkin": 1.0,
        "LC3-II": 1.0
    }
}
milieu = sandbox.ingest_context_and_build(disease_context, omics_data)
kg = milieu.knowledge_graph

# Baseline PageRank
baseline_pr = compute_pagerank(kg.adjacency_matrix)

# Run simulation
sandbox.simulate_peptide("MGAFLGKVLKACVVALSGKLL", {"free_energy": -12.4})
log_path = os.path.join(SIMULATION_PATH, "ensemble_uncertainty_log.json")
with open(log_path, 'r') as f:
    log_data = json.load(f)

node_names = sorted(list(kg.nodes.keys()))
final_activities = {n: log_data["trajectories"][n]["activity"]["mean"][-1] for n in node_names}

n = len(node_names)
perturbed_adj = np.zeros((n, n))
for edge in kg.edges:
    src, tgt, w = edge["source"], edge["target"], abs(edge["weight"])
    src_idx = kg.node_to_index[src]
    tgt_idx = kg.node_to_index[tgt]
    # Scale edges by final activities
    scale = (final_activities[src] + final_activities[tgt]) / 2.0
    perturbed_adj[src_idx, tgt_idx] = w * scale
    perturbed_adj[tgt_idx, src_idx] = w * scale

# Use activities as personalization vector
activity_vector = [final_activities[name] for name in node_names]
perturbed_pr = compute_pagerank(perturbed_adj, personalization=activity_vector)

simulated_shifts = perturbed_pr - baseline_pr

print("=== PAGERANK SHIFTS ===")
for node in ["LC3-II", "Parkin", "PINK1", "mTOR", "AKT"]:
    idx = kg.node_to_index[node]
    print(f"{node}: baseline={baseline_pr[idx]:.4f}, perturbed={perturbed_pr[idx]:.4f}, shift={simulated_shifts[idx]:.4f}")
