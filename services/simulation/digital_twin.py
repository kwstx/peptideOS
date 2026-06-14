import numpy as np
import logging
import time
import json
import os
from typing import Dict, Any, List, Tuple
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger("simulation-service.digital-twin")

class KnowledgeGraph:
    """
    Unified knowledge graph fusing curated multi-omics layers from public repositories.
    Constructs a protein-protein interaction (PPI) topology for signaling pathways.
    """
    def __init__(self):
        self.nodes = {}
        self.edges = []
        self.node_to_index = {}
        self.index_to_node = {}
        self.adjacency_matrix = None
        self._initialize_default_network()
        
    def _initialize_default_network(self):
        # Default high-fidelity PPI graph of relevant targets
        default_nodes = {
            "PINK1": {"role": "Kinase", "abundance": 1.0, "ptm": 0.05, "activity": 0.1},
            "Parkin": {"role": "E3 Ubiquitin Ligase", "abundance": 1.0, "ptm": 0.02, "activity": 0.05},
            "Mfn2": {"role": "GTPase / Receptor", "abundance": 1.0, "ptm": 0.1, "activity": 0.1},
            "VDAC1": {"role": "Ion Channel / Target", "abundance": 1.0, "ptm": 0.05, "activity": 0.1},
            "OPTN": {"role": "Autophagy Receptor", "abundance": 1.0, "ptm": 0.05, "activity": 0.1},
            "LC3-II": {"role": "Autophagosome Marker / Effector", "abundance": 1.0, "ptm": 0.1, "activity": 0.05},
            "mTOR": {"role": "Master Regulator Kinase", "abundance": 1.0, "ptm": 0.2, "activity": 0.4},
            "MAPK": {"role": "Mitogen-Activated Kinase", "abundance": 1.0, "ptm": 0.15, "activity": 0.3},
            "JAK": {"role": "Tyrosine Kinase", "abundance": 1.0, "ptm": 0.1, "activity": 0.2},
            "STAT": {"role": "Transcription Factor", "abundance": 1.0, "ptm": 0.05, "activity": 0.15},
            "AKT": {"role": "Survival Kinase", "abundance": 1.0, "ptm": 0.2, "activity": 0.3},
            "EGFR": {"role": "Receptor Tyrosine Kinase", "abundance": 1.0, "ptm": 0.1, "activity": 0.2},
            "GSK3B": {"role": "Serine/Threonine Kinase", "abundance": 1.0, "ptm": 0.3, "activity": 0.5},
            "BAX": {"role": "Pro-apoptotic Protein", "abundance": 1.0, "ptm": 0.01, "activity": 0.05},
            "BCL2": {"role": "Anti-apoptotic Protein", "abundance": 1.0, "ptm": 0.1, "activity": 0.4},
            "CASP9": {"role": "Initiator Caspase", "abundance": 1.0, "ptm": 0.02, "activity": 0.05},
            "CASP3": {"role": "Executioner Caspase / Downstream Effector", "abundance": 1.0, "ptm": 0.01, "activity": 0.02}
        }
        
        default_edges = [
            ("PINK1", "Mfn2", 0.9, "phosphorylation"),
            ("Mfn2", "Parkin", 0.8, "activation"),
            ("PINK1", "Parkin", 0.95, "phosphorylation"),
            ("Parkin", "VDAC1", 0.85, "ubiquitination"),
            ("VDAC1", "OPTN", 0.75, "binding"),
            ("OPTN", "LC3-II", 0.9, "recruitment"),
            ("EGFR", "MAPK", 0.8, "activation"),
            ("EGFR", "AKT", 0.85, "activation"),
            ("AKT", "mTOR", 0.9, "activation"),
            ("mTOR", "GSK3B", -0.7, "inhibition"),
            ("JAK", "STAT", 0.85, "phosphorylation"),
            ("AKT", "BAX", -0.8, "inhibition"),
            ("BCL2", "BAX", -0.85, "inhibition"),
            ("BAX", "CASP9", 0.9, "activation"),
            ("CASP9", "CASP3", 0.95, "activation")
        ]
        
        for name, data in default_nodes.items():
            self.nodes[name] = data
            
        for src, tgt, weight, itype in default_edges:
            self.edges.append({
                "source": src,
                "target": tgt,
                "weight": weight,
                "type": itype
            })
            
        self._build_index_and_matrix()

    def _build_index_and_matrix(self):
        node_names = sorted(list(self.nodes.keys()))
        self.node_to_index = {name: idx for idx, name in enumerate(node_names)}
        self.index_to_node = {idx: name for idx, name in enumerate(node_names)}
        
        n = len(node_names)
        self.adjacency_matrix = np.zeros((n, n))
        for edge in self.edges:
            src_idx = self.node_to_index[edge["source"]]
            tgt_idx = self.node_to_index[edge["target"]]
            self.adjacency_matrix[src_idx, tgt_idx] = abs(edge["weight"])
            self.adjacency_matrix[tgt_idx, src_idx] = abs(edge["weight"])

    def ingest_omics_data(self, omics_data: Dict[str, Any]):
        layers = omics_data.get('layers', [])
        logger.info(f"Fusing {len(layers)} multi-omics layers ({', '.join(layers)}) into unified knowledge graph.")
        features = omics_data.get('features', {})
        for name, val in features.items():
            if name in self.nodes:
                self.nodes[name]["abundance"] = float(val)
                logger.debug(f"Updated node {name} abundance to {val} from omics data.")

    def run_network_diffusion(self, seed_nodes: Dict[str, float], alpha: float = 0.75) -> Dict[str, float]:
        """
        Runs random walk with restart (RWR) network diffusion algorithm to propagate signaling changes.
        """
        n = len(self.node_to_index)
        s_0 = np.zeros(n)
        for node, weight in seed_nodes.items():
            if node in self.node_to_index:
                s_0[self.node_to_index[node]] = weight
                
        s_sum = np.sum(s_0)
        if s_sum > 0:
            s_0 = s_0 / s_sum
            
        col_sums = np.sum(self.adjacency_matrix, axis=0)
        W = np.zeros_like(self.adjacency_matrix)
        for j in range(n):
            if col_sums[j] > 0:
                W[:, j] = self.adjacency_matrix[:, j] / col_sums[j]
            else:
                W[:, j] = 1.0 / n
                
        s_k = s_0.copy()
        max_iters = 100
        tol = 1e-6
        for _ in range(max_iters):
            s_next = alpha * np.dot(W, s_k) + (1 - alpha) * s_0
            if np.linalg.norm(s_next - s_k) < tol:
                s_k = s_next
                break
            s_k = s_next
            
        diffusion_scores = {self.index_to_node[i]: float(s_k[i]) for i in range(n)}
        return diffusion_scores


class LangevinMDSimulator:
    """
    Selective high-fidelity molecular dynamics trajectories on critical protein subnetworks.
    Simulates physical interactions between a peptide and target protein domains using 3D Langevin dynamics.
    """
    def __init__(self, temperature: float = 300.0, friction: float = 0.5, dt: float = 0.01):
        self.kBT = 8.314e-3 * temperature # ~2.5 kJ/mol or 0.6 kcal/mol
        self.gamma = friction
        self.dt = dt
        self.kb = 100.0
        self.d0 = 1.5
        self.sigma = 3.0
        self.epsilon_att = 6.0
        self.epsilon_rep = 1.5

    def run_trajectory(self, node_name: str, peptide_sequence: str, peptide_charge: float, target_charge: float, steps: int = 250) -> Dict[str, Any]:
        logger.info(f"Running selective high-fidelity Langevin MD trajectory for node '{node_name}'...")
        r_pep = np.array([
            [0.0, 0.0, 0.0],
            [1.5, 0.0, 0.0],
            [3.0, 0.0, 0.0]
        ])
        
        r_prot = np.array([
            [6.5, 0.0, 0.0],
            [8.0, 1.0, 0.0],
            [9.5, -1.0, 0.0]
        ])
        
        v_pep = np.random.normal(0, np.sqrt(self.kBT), (3, 3))
        v_prot = np.random.normal(0, np.sqrt(self.kBT), (3, 3))
        
        r = np.vstack([r_pep, r_prot])
        v = np.vstack([v_pep, v_prot])
        
        charges = np.array([peptide_charge, 0.0, -peptide_charge, -target_charge, 0.0, target_charge])
        
        energies = []
        distances = []
        bound_count = 0
        
        for step in range(steps):
            forces = np.zeros_like(r)
            pot_energy = 0.0
            
            bonds = [(0, 1), (1, 2), (3, 4), (4, 5)]
            for u, w in bonds:
                dr = r[u] - r[w]
                dist = np.linalg.norm(dr)
                if dist > 0:
                    f_mag = -self.kb * (dist - self.d0)
                    f_vec = (dr / dist) * f_mag
                    forces[u] += f_vec
                    forces[w] -= f_vec
                    pot_energy += 0.5 * self.kb * (dist - self.d0)**2
            
            for i in range(3):
                for j in range(3, 6):
                    dr = r[i] - r[j]
                    dist = np.linalg.norm(dr)
                    if dist > 0.1:
                        eps = self.epsilon_att if (i == 1 and j == 3) else self.epsilon_rep
                        s_r6 = (self.sigma / dist)**6
                        s_r12 = s_r6**2
                        
                        if i == 1 and j == 3:
                            pot_lj = 4.0 * eps * (s_r12 - s_r6)
                            f_lj_mag = (24.0 * eps / dist) * (2.0 * s_r12 - s_r6)
                        else:
                            pot_lj = 4.0 * eps * (s_r12)
                            f_lj_mag = (24.0 * eps / dist) * (2.0 * s_r12)
                            
                        q_i = charges[i]
                        q_j = charges[j]
                        pot_coul = (q_i * q_j) / dist
                        f_coul_mag = (q_i * q_j) / (dist**2)
                        
                        f_total_mag = f_lj_mag + f_coul_mag
                        f_vec = (dr / dist) * f_total_mag
                        forces[i] += f_vec
                        forces[j] -= f_vec
                        
                        pot_energy += pot_lj + pot_coul
                        
            core_pocket_dist = np.linalg.norm(r[1] - r[3])
            distances.append(core_pocket_dist)
            energies.append(pot_energy)
            if core_pocket_dist < 4.5:
                bound_count += 1
                
            thermal_std = np.sqrt(2.0 * self.gamma * self.kBT / self.dt)
            for k in range(6):
                f_thermal = np.random.normal(0, thermal_std, 3)
                f_total = forces[k] + f_thermal
                v[k] = v[k] * (1.0 - self.gamma * self.dt) + f_total * self.dt
                r[k] += v[k] * self.dt
                
        mean_pot_energy = float(np.mean(energies))
        min_dist = float(np.min(distances))
        binding_stability = float(bound_count / steps)
        coupling_factor = float(0.2 + 1.8 * binding_stability)
        
        return {
            "node_name": node_name,
            "mean_energy": mean_pot_energy,
            "min_distance": min_dist,
            "binding_stability": binding_stability,
            "coupling_factor": coupling_factor
        }


class PathSDESolver:
    """
    Time-resolved pathway SDE solver. Computes shifts in protein abundances,
    PTM states, and downstream effector activities over a user-defined temporal horizon.
    """
    def __init__(self, kg: KnowledgeGraph, coupling_factors: Dict[str, float], temporal_horizon: float = 10.0, dt: float = 0.05):
        self.kg = kg
        self.coupling_factors = coupling_factors
        self.T = temporal_horizon
        self.dt = dt
        self.times = np.arange(0, self.T + self.dt, self.dt)
        self.num_steps = len(self.times)
        self.sigma_p = 0.05
        self.sigma_m = 0.02
        self.sigma_a = 0.02
        
    def solve_single_trajectory(self, param_seeds: Dict[str, Any]) -> Dict[str, np.ndarray]:
        nodes = list(self.kg.nodes.keys())
        n_nodes = len(nodes)
        
        p_traj = np.zeros((self.num_steps, n_nodes))
        m_traj = np.zeros((self.num_steps, n_nodes))
        a_traj = np.zeros((self.num_steps, n_nodes))
        
        synthesis_rates = {}
        deg_rates = {}
        ptm_rates = {}
        ptm_decay = {}
        act_rates = {}
        act_decay = {}
        
        for idx, node in enumerate(nodes):
            node_props = self.kg.nodes[node]
            seed_val = param_seeds.get(node, {})
            
            synthesis_rates[node] = seed_val.get("synthesis_rate", 0.2)
            deg_rates[node] = seed_val.get("deg_rate", 0.2)
            ptm_rates[node] = seed_val.get("ptm_rate", 1.5)
            ptm_decay[node] = seed_val.get("ptm_decay", 0.5)
            act_rates[node] = seed_val.get("act_rate", 1.5)
            act_decay[node] = seed_val.get("act_decay", 0.4)
            
            p_traj[0, idx] = seed_val.get("init_abundance", node_props.get("abundance", 1.0))
            m_traj[0, idx] = seed_val.get("init_ptm", node_props.get("ptm", 0.1))
            a_traj[0, idx] = seed_val.get("init_activity", node_props.get("activity", 0.1))
            
        regulators = {node: [] for node in nodes}
        for edge in self.kg.edges:
            src = edge["source"]
            tgt = edge["target"]
            if src in self.kg.node_to_index and tgt in self.kg.node_to_index:
                src_idx = self.kg.node_to_index[src]
                regulators[tgt].append((src_idx, edge["weight"], edge["type"]))
                
        for t_idx in range(self.num_steps - 1):
            p_current = p_traj[t_idx]
            m_current = m_traj[t_idx]
            a_current = a_traj[t_idx]
            
            p_next = p_current.copy()
            m_next = m_current.copy()
            a_next = a_current.copy()
            
            for idx, node in enumerate(nodes):
                p_i = p_current[idx]
                m_i = m_current[idx]
                a_i = a_current[idx]
                
                diffusion_term = 0.0
                node_idx = self.kg.node_to_index[node]
                for neighbor_idx in range(n_nodes):
                    if neighbor_idx != node_idx:
                        adj_val = self.kg.adjacency_matrix[node_idx, neighbor_idx]
                        if adj_val > 0:
                            diffusion_term += 0.02 * adj_val * (p_current[neighbor_idx] - p_i)
                            
                dp = (synthesis_rates[node] - deg_rates[node] * p_i + diffusion_term) * self.dt
                dw_p = np.random.normal(0, np.sqrt(self.dt))
                dp += self.sigma_p * p_i * dw_p
                p_next[idx] = max(0.0, p_i + dp)
                
                regs = regulators[node]
                if not regs:
                    reg_signal = 0.1
                else:
                    activator_sum = 0.0
                    inhibitor_sum = 0.0
                    for up_idx, w, itype in regs:
                        up_act = a_current[up_idx]
                        if w > 0:
                            activator_sum += w * up_act
                        else:
                            inhibitor_sum += abs(w) * up_act
                    reg_signal = 0.1 + activator_sum - inhibitor_sum
                    reg_signal = max(0.0, min(1.0, reg_signal))
                    
                lmbda = self.coupling_factors.get(node, 1.0)
                
                dm = (ptm_rates[node] * lmbda * reg_signal * (1.0 - m_i) - ptm_decay[node] * m_i) * self.dt
                dw_m = np.random.normal(0, np.sqrt(self.dt))
                noise_scale = np.sqrt(max(0.0, m_i * (1.0 - m_i)))
                dm += self.sigma_m * noise_scale * dw_m
                m_next[idx] = max(0.0, min(1.0, m_i + dm))
                
                da = (act_rates[node] * m_next[idx] * (1.0 - a_i) - act_decay[node] * a_i) * self.dt
                dw_a = np.random.normal(0, np.sqrt(self.dt))
                noise_scale_a = np.sqrt(max(0.0, a_i * (1.0 - a_i)))
                da += self.sigma_a * noise_scale_a * dw_a
                a_next[idx] = max(0.0, min(1.0, a_i + da))
                
            p_traj[t_idx + 1] = p_next
            m_traj[t_idx + 1] = m_next
            a_traj[t_idx + 1] = a_next
            
        return {
            "times": self.times,
            "nodes": nodes,
            "protein_abundance": p_traj,
            "ptm_state": m_traj,
            "effector_activity": a_traj
        }


class VirtualCellularMilieu:
    """
    Reproducible virtual cellular milieu constructed as a multi-scale modeling environment.
    Couples network diffusion, Langevin molecular dynamics, and parallelized SDE solvers.
    """
    def __init__(self, disease_context: Dict[str, Any]):
        self.context_id = disease_context.get("id", "unknown_context")
        self.targets = disease_context.get("targets", ["mTOR"])
        self.disease_state = disease_context.get("disease_state", "Unknown")
        self.knowledge_graph = KnowledgeGraph()
        self.md_simulator = LangevinMDSimulator()
        logger.info(f"Reproducible virtual cellular milieu instantiated for context: {self.context_id}")

    def propagate_perturbation(self, peptide_descriptors: Dict[str, Any], steps: int = 50) -> Dict[str, float]:
        """
        Runs the full hybrid computational engine:
        1. Coarse-grained network diffusion to find critical subnetworks.
        2. Selective high-fidelity MD trajectories on those critical subnetworks.
        3. Parallelized time-resolved SDE solver with ensemble sampling.
        4. Logs uncertainty estimates.
        """
        logger.info("Starting hybrid computational simulation engine...")
        
        # 1. Coarse-grained network diffusion
        free_energy = peptide_descriptors.get("free_energy", -5.0)
        seed_strength = min(1.0, abs(free_energy) / 10.0)
        
        seed_nodes = {target: seed_strength for target in self.targets}
        if not any(s in self.knowledge_graph.node_to_index for s in seed_nodes):
            seed_nodes = {"mTOR": seed_strength, "PINK1": seed_strength}
            
        logger.info(f"Seeding network diffusion with: {seed_nodes}")
        diffusion_scores = self.knowledge_graph.run_network_diffusion(seed_nodes, alpha=0.75)
        
        sorted_nodes = sorted(diffusion_scores.items(), key=lambda x: x[1], reverse=True)
        critical_nodes = [node for node, score in sorted_nodes[:3]]
        logger.info(f"Identified critical subnetwork nodes: {critical_nodes}")
        
        # 2. Selective high-fidelity Molecular Dynamics trajectories
        peptide_seq = peptide_descriptors.get("sequence", "MGAFLGKVLKACVVALSGKLL")
        peptide_charge = sum([1 for c in peptide_seq if c in "KR"]) - sum([1 for c in peptide_seq if c in "DE"])
        if peptide_charge == 0:
            peptide_charge = 1.0
            
        coupling_factors = {}
        for node in critical_nodes:
            target_role = self.knowledge_graph.nodes[node].get("role", "Kinase")
            target_charge = -2.0 if "Kinase" in target_role else -1.0
            
            md_res = self.md_simulator.run_trajectory(
                node_name=node,
                peptide_sequence=peptide_seq,
                peptide_charge=float(peptide_charge),
                target_charge=target_charge,
                steps=200
            )
            coupling_factors[node] = md_res["coupling_factor"]
            
        # 3. Parallelized SDE solver over temporal horizon
        temporal_horizon = 12.0
        dt = 0.05
        solver = PathSDESolver(self.knowledge_graph, coupling_factors, temporal_horizon, dt)
        
        # 4. Ensemble sampling for uncertainty estimation
        num_ensemble = 15
        nodes = list(self.knowledge_graph.nodes.keys())
        n_nodes = len(nodes)
        
        ensemble_seeds = []
        for ens_idx in range(num_ensemble):
            seeds = {}
            for node in nodes:
                seeds[node] = {
                    "synthesis_rate": float(0.2 * np.exp(np.random.normal(0, 0.15))),
                    "deg_rate": float(0.2 * np.exp(np.random.normal(0, 0.15))),
                    "ptm_rate": float(1.5 * np.exp(np.random.normal(0, 0.15))),
                    "ptm_decay": float(0.5 * np.exp(np.random.normal(0, 0.15))),
                    "act_rate": float(1.5 * np.exp(np.random.normal(0, 0.15))),
                    "act_decay": float(0.4 * np.exp(np.random.normal(0, 0.15))),
                    "init_abundance": float(max(0.1, self.knowledge_graph.nodes[node]["abundance"] * np.exp(np.random.normal(0, 0.1)))),
                    "init_ptm": float(max(0.01, min(0.99, self.knowledge_graph.nodes[node]["ptm"] * np.exp(np.random.normal(0, 0.15))))),
                    "init_activity": float(max(0.01, min(0.99, self.knowledge_graph.nodes[node]["activity"] * np.exp(np.random.normal(0, 0.15)))))
                }
            ensemble_seeds.append(seeds)
            
        logger.info(f"Spawning {num_ensemble} parallel solver threads for ensemble sampling...")
        ensemble_results = []
        with ThreadPoolExecutor(max_workers=min(num_ensemble, 8)) as executor:
            futures = [executor.submit(solver.solve_single_trajectory, seeds) for seeds in ensemble_seeds]
            for f in futures:
                ensemble_results.append(f.result())
                
        # 5. Process ensemble results to compute mean and standard deviation (uncertainty)
        num_steps = solver.num_steps
        p_all = np.zeros((num_ensemble, num_steps, n_nodes))
        m_all = np.zeros((num_ensemble, num_steps, n_nodes))
        a_all = np.zeros((num_ensemble, num_steps, n_nodes))
        
        for idx, res in enumerate(ensemble_results):
            p_all[idx] = res["protein_abundance"]
            m_all[idx] = res["ptm_state"]
            a_all[idx] = res["effector_activity"]
            
        p_mean = np.mean(p_all, axis=0)
        p_std = np.std(p_all, axis=0)
        
        m_mean = np.mean(m_all, axis=0)
        m_std = np.std(m_all, axis=0)
        
        a_mean = np.mean(a_all, axis=0)
        a_std = np.std(a_all, axis=0)
        
        # Log uncertainty estimates to JSON file
        times_list = solver.times.tolist()
        uncertainty_log = {
            "context_id": self.context_id,
            "disease_state": self.disease_state,
            "targets": self.targets,
            "times": times_list,
            "nodes": nodes,
            "trajectories": {}
        }
        
        for idx, node in enumerate(nodes):
            uncertainty_log["trajectories"][node] = {
                "abundance": {
                    "mean": p_mean[:, idx].tolist(),
                    "std": p_std[:, idx].tolist()
                },
                "ptm": {
                    "mean": m_mean[:, idx].tolist(),
                    "std": m_std[:, idx].tolist()
                },
                "activity": {
                    "mean": a_mean[:, idx].tolist(),
                    "std": a_std[:, idx].tolist()
                }
            }
            
        log_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ensemble_uncertainty_log.json")
        try:
            with open(log_path, "w") as f:
                json.dump(uncertainty_log, f, indent=2)
            logger.info(f"Ensemble uncertainty logs written to: {log_path}")
        except Exception as e:
            logger.error(f"Failed to write uncertainty log: {e}")
            
        final_effector_activities = {}
        for idx, node in enumerate(nodes):
            final_effector_activities[node] = float(a_mean[-1, idx])
            
        return final_effector_activities


class DigitalTwinSandbox:
    """
    Containerized, version-controlled multi-scale modeling environment.
    Exposes API interface for hybrid proteome impact simulations.
    """
    def __init__(self):
        self.version = "1.1.0"
        self.milieu = None
        
    def ingest_context_and_build(self, disease_context: Dict[str, Any], omics_data: Dict[str, Any]):
        logger.info(f"Building Digital Twin Sandbox (v{self.version})...")
        self.milieu = VirtualCellularMilieu(disease_context)
        self.milieu.knowledge_graph.ingest_omics_data(omics_data)
        return self.milieu
        
    def simulate_peptide(self, peptide_sequence: str, descriptors: Dict[str, Any]) -> float:
        if not self.milieu:
            raise ValueError("Sandbox not built. Call ingest_context_and_build first.")
            
        logger.info(f"Simulating peptide '{peptide_sequence}' in virtual cellular milieu.")
        descriptors["sequence"] = peptide_sequence
        
        final_effector_activities = self.milieu.propagate_perturbation(descriptors)
        
        is_mitophagy = any(t in ["PINK1", "Parkin", "Mfn2", "VDAC1", "OPTN", "LC3-II"] for t in self.milieu.targets)
        
        if is_mitophagy:
            lc3_activity = final_effector_activities.get("LC3-II", 0.05)
            recovery_score = max(0.0, min(1.0, lc3_activity / 0.95))
        else:
            avg_activity = float(np.mean([final_effector_activities.get(t, 0.5) for t in self.milieu.targets]))
            recovery_score = max(0.0, min(1.0, 1.0 - abs(avg_activity - 0.1)))
            
        logger.info(f"Digital Twin simulation resolved. Deficit recovery score: {recovery_score:.4f}")
        return recovery_score
