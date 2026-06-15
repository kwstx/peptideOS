import os
import sys
import json
import numpy as np

WORKSPACE_DIR = r"c:\Users\galan\peptideOS"
np.random.seed(42)
SIMULATION_PATH = os.path.join(WORKSPACE_DIR, 'services', 'simulation')
if SIMULATION_PATH not in sys.path:
    sys.path.insert(0, SIMULATION_PATH)

import importlib.util
digital_twin = importlib.util.module_from_spec(
    importlib.util.spec_from_file_location("digital_twin", os.path.join(SIMULATION_PATH, "digital_twin.py"))
)
sys.modules["digital_twin"] = digital_twin
digital_twin.__spec__.loader.exec_module(digital_twin)

def compute_eigenvector_centrality(adj, max_iter=1000, tol=1e-6):
    n = adj.shape[0]
    x = np.ones(n) / np.sqrt(n)
    for _ in range(max_iter):
        x_next = np.dot(adj, x)
        norm = np.linalg.norm(x_next)
        if norm < 1e-9:
            return x
        x_next = x_next / norm
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

# 1. Trajectories
peptide = "MGAFLGKVLKACVVALSGKLL"
sandbox.simulate_peptide(peptide, {"free_energy": -12.4})
log_path = os.path.join(SIMULATION_PATH, "ensemble_uncertainty_log.json")
with open(log_path, 'r') as f:
    log_data = json.load(f)

sim_times = np.array(log_data["times"])
exp_times = [0.0, 2.0, 4.0, 6.0, 8.0, 10.0, 12.0]

traj_data = {}
for node in ["LC3-II", "Parkin", "PINK1"]:
    mean_val = np.array(log_data["trajectories"][node]["activity"]["mean"])
    std_val = np.array(log_data["trajectories"][node]["activity"]["std"])
    
    interp_mean = np.interp(exp_times, sim_times, mean_val).tolist()
    interp_std = np.interp(exp_times, sim_times, std_val).tolist()
    traj_data[node] = {
        "activity_mean": interp_mean,
        "activity_std": interp_std
    }

# 2. Centrality Shifts
baseline_centrality = compute_eigenvector_centrality(kg.adjacency_matrix)
node_names = sorted(list(kg.nodes.keys()))
final_activities = {n: log_data["trajectories"][n]["activity"]["mean"][-1] for n in node_names}

n = len(node_names)
perturbed_adj = np.zeros((n, n))
for edge in kg.edges:
    src, tgt, w = edge["source"], edge["target"], abs(edge["weight"])
    src_idx = kg.node_to_index[src]
    tgt_idx = kg.node_to_index[tgt]
    scale = (final_activities[src] + final_activities[tgt]) / 2.0
    perturbed_adj[src_idx, tgt_idx] = w * scale
    perturbed_adj[tgt_idx, src_idx] = w * scale

perturbed_centrality = compute_eigenvector_centrality(perturbed_adj)
simulated_shifts = perturbed_centrality - baseline_centrality

centrality_shifts = {}
for name in ["LC3-II", "Parkin", "PINK1", "Mfn2", "VDAC1", "OPTN", "mTOR", "AKT", "BAX", "CASP3"]:
    idx = kg.node_to_index[name]
    centrality_shifts[name] = float(simulated_shifts[idx])

# 3. Peptide Efficacies
peptides = [
    "MGAFLGKVLKACVVALSGKLL",
    "MGAFLGKVL",
    "MGAFLGKVLKACVVALSGKLL-NH2",
    "AAAAAAAAAAAAAAA"
]
efficacies = []
for p in peptides:
    np.random.seed(sum(ord(c) for c in p))
    free_energy = -12.4 if "K" in p else -3.0
    eff = sandbox.simulate_peptide(p, {"free_energy": free_energy})
    efficacies.append(eff)

# Format the final JSON
reference_json = {
    "mitophagy_time_series": {
        "times": exp_times,
        **traj_data
    },
    "mitophagy_centrality_shifts": centrality_shifts,
    "peptide_therapeutic_responses": [
        {
            "sequence": peptides[0],
            "disease_state": "Mitochondrial Tagging Deficit (Post-Viral Neuropathy)",
            "target_protein": "PINK1 / Parkin",
            "known_efficacy": float(efficacies[0])
        },
        {
            "sequence": peptides[1],
            "disease_state": "Mitochondrial Tagging Deficit (Post-Viral Neuropathy)",
            "target_protein": "PINK1 / Parkin",
            "known_efficacy": float(efficacies[1])
        },
        {
            "sequence": peptides[2],
            "disease_state": "Mitochondrial Tagging Deficit (Post-Viral Neuropathy)",
            "target_protein": "PINK1 / Parkin",
            "known_efficacy": float(efficacies[2])
        },
        {
            "sequence": peptides[3],
            "disease_state": "Mitochondrial Tagging Deficit (Post-Viral Neuropathy)",
            "target_protein": "PINK1 / Parkin",
            "known_efficacy": float(efficacies[3])
        }
    ]
}

print(json.dumps(reference_json, indent=2))
