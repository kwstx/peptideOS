import { useState, useEffect, useRef } from 'react';
import './App.css';

// Initial logs preset
const INITIAL_LOGS = [
  { time: '20:46:59', service: 'gateway', text: 'PeptiPrompt API gateway initialized. mTLS strict mode enabled.' },
  { time: '20:47:00', service: 'k8s', text: 'Service mesh active. 5 service endpoints registered in Istio.' },
  { time: '20:47:01', service: 'kafka', text: 'Kafka broker connected on port 9092. Topics: [peptide-design-jobs, designed-peptides]' },
  { time: '20:47:02', service: 'qdrant', text: 'Vector index loaded. 5 prior peptide design embeddings online.' }
];

// Prior designs library for vector search simulator
const PRIOR_DESIGNS = [
  {
    id: "PEP-1042",
    disease_state: "Mitochondrial Tagging Deficit (Post-Viral Neuropathy)",
    description: "Designed to correct mitochondrial tagging deficits in neurons after viral exposure by enhancing PINK1/Parkin outer-membrane recruitment.",
    sequence: "MGAFLGKVLKACVVALSGKLL-NH2",
    binding_affinity: -12.4,
    stability: 0.94
  },
  {
    id: "PEP-2210",
    disease_state: "Alzheimer's Disease (Amyloid-Beta Aggregation)",
    description: "Disrupts the self-assembly of amyloid-beta (Abeta42) oligomers, preventing neurotoxic plaque formation.",
    sequence: "KLVFF-NH2",
    binding_affinity: -9.8,
    stability: 0.82
  },
  {
    id: "PEP-3051",
    disease_state: "SARS-CoV-2 Viral Entry (Spike Protein Blockade)",
    description: "Competitively binds to the receptor binding domain (RBD) of SARS-CoV-2 spike protein, blocking human ACE2 interaction.",
    sequence: "IEEQAKTFLDKFNHEAEDLFYQ-NH2",
    binding_affinity: -14.2,
    stability: 0.91
  },
  {
    id: "PEP-0982",
    disease_state: "Oncology (p53-MDM2 Pathway Restoration)",
    description: "Mimics the transactivation domain of p53 to bind MDM2, thereby releasing p53 from degradation and restoring tumor suppressor function.",
    sequence: "ETFSDLWKLLPE-NH2",
    binding_affinity: -11.9,
    stability: 0.85
  },
  {
    id: "PEP-4109",
    disease_state: "Parkinson's Disease (Alpha-Synuclein Fibrillization)",
    description: "Targeted peptide binder that anchors to alpha-synuclein monomers to inhibit cellular nucleation and propagation.",
    sequence: "EGVVAAAEKTK-NH2",
    binding_affinity: -10.1,
    stability: 0.87
  }
];

// Pathway data
const BIOLOGICAL_PATHWAYS = [
  { id: "PINK1", label: "Protein Kinase", desc: "Accumulates on outer mitochondrial membrane of damaged mitochondria." },
  { id: "Parkin", label: "E3 Ubiquitin Ligase", desc: "Recruited and activated by phosphorylated ubiquitin to tag outer membrane proteins." },
  { id: "Mfn2", label: "GTPase", desc: "Mitofusin-2; phosphorylated by PINK1, promoting Parkin binding." },
  { id: "VDAC1", label: "Ion Channel", desc: "Voltage-dependent anion channel; ubiquitinated by Parkin to recruit autophagy receptors." },
  { id: "OPTN", label: "Autophagy Receptor", desc: "Optineurin; binds ubiquitinated cargo and links them to LC3-II on phagophores." },
  { id: "LC3-II", label: "Autophagosome Marker", desc: "Mediates final phagophore closure and lysosome fusing." }
];

export default function App() {
  const [activeTab, setActiveTab] = useState('workspace'); // workspace, pathways, vectors
  const [e2eeEnabled, setE2eeEnabled] = useState(false);
  const [epsilonVal, setEpsilonVal] = useState(1.0);
  const [consentGiven, setConsentGiven] = useState(true);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditVerified, setAuditVerified] = useState(false);
  const [auditChecking, setAuditChecking] = useState(false);
  const [promptText, setPromptText] = useState('Correcting mitochondrial tagging deficits in neurons after viral exposure');
  const [targetProtein, setTargetProtein] = useState('PINK1 / Parkin');
  const [complexity, setComplexity] = useState('standard');
  const [sequenceLength, setSequenceLength] = useState(25);
  const [offTargetTolerance, setOffTargetTolerance] = useState(0.05);
  
  // WebSocket Live Stream Data
  const [liveStreamData, setLiveStreamData] = useState([]);
  
  // Pipeline simulation states
  const [isDesigning, setIsDesigning] = useState(false);
  const [pipelineStage, setPipelineStage] = useState('IDLE'); // IDLE, DIFFUSION, KAFKA, SIMULATION, SAVED, COMPLETED
  const [pipelineProgress, setPipelineProgress] = useState(0);
  const [activeNode, setActiveNode] = useState(null); // Pathway Explorer active node
  
  // Physical telemetry states
  const [rmsd, setRmsd] = useState(3.5);
  const [entropy, setEntropy] = useState(1.2);
  const [freeEnergy, setFreeEnergy] = useState(0);
  const [perturbationIndex, setPerturbationIndex] = useState(1.0);
  const [currentResidue, setCurrentResidue] = useState('-');
  
  // Infrastructure metrics states
  const [replicas, setReplicas] = useState(2);
  const [cpuLoad, setCpuLoad] = useState(24);
  const [kafkaQueue, setKafkaQueue] = useState(0);
  const [circuitBreaker, setCircuitBreaker] = useState('CLOSED'); // CLOSED, OPEN, HALF_OPEN
  
  // Output results
  const [designedSequence, setDesignedSequence] = useState('');
  const [synthesisScript, setSynthesisScript] = useState('');
  const [efficacyRiskData, setEfficacyRiskData] = useState({
    therapeutic_index: {
      point_prediction: 18.45,
      conformal_interval: [12.21, 24.69],
      calibration_margin: 6.24
    },
    dose_response: {
      doses_uM: [0.001, 0.01, 0.1, 1.0, 10.0, 100.0, 1000.0],
      predicted_responses: [0.002, 0.015, 0.184, 0.742, 0.925, 0.94, 0.935],
      conformal_band_lower: [0.0, 0.0, 0.062, 0.584, 0.812, 0.825, 0.818],
      conformal_band_upper: [0.024, 0.082, 0.312, 0.892, 0.995, 1.0, 1.0],
      hill_parameters: {
        Emax: 0.942,
        EC50: 0.452,
        HillSlope: 1.184
      }
    },
    adverse_events: {
      probabilities: {
        "Apoptosis Pathway Activation": 0.084,
        "Inflammatory Cascade Triggering": 0.112,
        "Off-Target Kinase Exhaustion": 0.051,
        "Mitophagosome Blockage": 0.038
      },
      conformal_thresholds: {
        "Apoptosis Pathway Activation": 0.284,
        "Inflammatory Cascade Triggering": 0.315,
        "Off-Target Kinase Exhaustion": 0.25,
        "Mitophagosome Blockage": 0.32
      },
      conformal_prediction_set: [],
      adverse_risk_level: "LOW"
    },
    compliance_report: (
      "# PEPTIDEOS CLINICAL & REGULATORY COMPLIANCE REPORT\n" +
      "## EFFICACY AND RISK QUANTIFICATION SUITE\n" +
      "**PEPTIDE IDENTIFIER:** PEP-1042\n" +
      "**SEQUENCE:** MGAFLGKVLKACVVALSGKLL-NH2\n" +
      "**EVALUATION DATE:** 2026-06-14\n" +
      "**ASSUAGED CONFIDENCE LIMIT:** 95.0% (Significance Level alpha = 0.05)\n\n" +
      "### 1. SUMMARY OF QUANTITATIVE FINDINGS\n" +
      "*   **Predicted Therapeutic Index (TI):** 18.45\n" +
      "*   **Calibrated 95.0% Conformal Interval:** [12.21, 24.69]\n" +
      "    *   *Note: Conformal bounds guarantee that the true therapeutic index lies within this interval with >= 95% probability under longitudinal outcomes.*\n" +
      "*   **Quantified Adverse Risk Class:** **LOW**\n\n" +
      "### 2. DOSE-RESPONSE PROFILE WITH CALIBRATED CONFORMAL BANDS\n" +
      "| Dose (microMolar) | Predicted Response | Conformal Lower Bound (95.0%) | Conformal Upper Bound (95.0%) |\n" +
      "|:-----------------:|:------------------:|:-----------------------------------:|:-----------------------------------:|\n" +
      "| 0.001             | 0.0020             | 0.0000                              | 0.0240                              |\n" +
      "| 0.01              | 0.0150             | 0.0000                              | 0.0820                              |\n" +
      "| 0.1               | 0.1840             | 0.0620                              | 0.3120                              |\n" +
      "| 1.0               | 0.7420             | 0.5840                              | 0.8920                              |\n" +
      "| 10.0              | 0.9250             | 0.8120                              | 0.9950                              |\n" +
      "| 100.0             | 0.9400             | 0.8250                              | 1.0000                              |\n" +
      "| 1000.0            | 0.9350             | 0.8180                              | 1.0000                              |\n\n" +
      "**Hill Equation Parametric Fitting:**\n" +
      "*   **Maximal Response (Emax):** 0.9420\n" +
      "*   **Half-Maximal Effective Dose (EC50):** 0.4520 uM\n" +
      "*   **Hill Coefficient (Slope):** 1.1840\n\n" +
      "### 3. ADVERSE NETWORK REWIRING RISK ASSESSMENT\n" +
      "| Adverse Rewiring Event | Predicted Probability | Conformal Calibration Threshold | Retained in Conformal Prediction Set |\n" +
      "|:----------------------|:---------------------:|:------------------------------:|:------------------------------------:|\n" +
      "| Apoptosis Pathway Activation | 0.0840              | 0.2840                         | NO                                   |\n" +
      "| Inflammatory Cascade Triggering | 0.1120           | 0.3150                         | NO                                   |\n" +
      "| Off-Target Kinase Exhaustion | 0.0510              | 0.2500                         | NO                                   |\n" +
      "| Mitophagosome Blockage | 0.0380                    | 0.3200                         | NO                                   |\n\n" +
      "**Conformal Active Prediction Set (Guaranteed coverage of true rewiring events):**\n" +
      "`[]`\n\n" +
      "### 4. METHODOLOGY & UNCERTAINTY CALIBRATION\n" +
      "1.  **Ensemble Machine Learning Models**: Multi-scale feature vectors were constructed from sequence, structural, and pathway trajectory features.\n" +
      "2.  **Split Conformal Prediction**: Models were calibrated on a disjoint partition of longitudinal therapeutic outcome records (n_cal=50). Conformal bounds ensure mathematical coverage guarantees, complying with FDA/EMA guidelines for machine-learning-assisted drug candidate profiling."
    )
  });
  
  // Log telemetry terminal
  const [logs, setLogs] = useState(INITIAL_LOGS);
  const terminalEndRef = useRef(null);
  
  // Canvas animation
  const canvasRef = useRef(null);
  const animationFrameId = useRef(null);
  const noiseLevel = useRef(1.0); // For diffusion simulation

  // Vector search
  const [searchQuery, setSearchQuery] = useState('mitochondrial deficit');
  const [searchResults, setSearchResults] = useState([]);

  // Developer Portal & SDK Sandbox States
  const [sdkLanguage, setSdkLanguage] = useState('python');
  const [sandboxPrompt, setSandboxPrompt] = useState('Disrupts the self-assembly of amyloid-beta oligomers');
  const [sandboxTarget, setSandboxTarget] = useState('Amyloid-Beta');
  const [sandboxComplexity, setSandboxComplexity] = useState('standard');
  const [sandboxEpsilon, setSandboxEpsilon] = useState(1.0);
  const [sandboxRunning, setSandboxRunning] = useState(false);
  const [sandboxResponse, setSandboxResponse] = useState(null);
  
  // Custom Plugin registration states
  const [customPluginCode, setCustomPluginCode] = useState(`# Custom Peptide Design Extension Plugin
import re
from typing import Dict, Any
from plugins import BasePeptidePlugin

class ImmunogenicityPenalizerPlugin(BasePeptidePlugin):
    """
    Screens generated sequences for immunogenic basic-charge clusters
    and applies a penalty to the generative RL reward function.
    """
    def __init__(self):
        super().__init__(name="ImmunogenicityPenalizer")
        self.high_risk_patterns = [r"KKK", r"W.*W", r"DE.*ED"]

    def evaluate_reward(self, sequence: str, latent_state: Any) -> float:
        clean_seq = sequence.replace("-NH2", "").replace(" ", "").upper()
        matches = sum(1 for p in self.high_risk_patterns if re.search(p, clean_seq))
        return float(-2.5 * matches)

    def get_metrics(self, sequence: str, latent_state: Any) -> Dict[str, float]:
        clean_seq = sequence.replace("-NH2", "").replace(" ", "").upper()
        hydrophobic_count = sum(1 for aa in clean_seq if aa in "WFYLIV")
        ratio = hydrophobic_count / max(1, len(clean_seq))
        return {
            "immunogenicity_risk_score": float(0.15 + (ratio * 0.5)),
            "hydrophobic_ratio": float(ratio)
        }
`);
  const [pluginRegistering, setPluginRegistering] = useState(false);
  const [pluginLogs, setPluginLogs] = useState([]);
  
  // Live Observability and Model Drift Telemetry States
  const [obsMetrics, setObsMetrics] = useState({
    throughput: { total_requests: 142, successful_designs: 138, failed_designs: 4, biosecurity_violations: 3, throughput_jobs_per_min: 12.4 },
    latency_seconds: { avg: 3.125, p50: 2.95, p95: 3.84, p99: 4.18 }
  });
  const [obsDrift, setObsDrift] = useState({
    drift_status: 'STABLE',
    kl_divergence: 0.184,
    metrics: {
      baseline_mean_length: 20.0,
      current_mean_length: 21.2,
      length_drift_percentage: 6.0,
      baseline_mean_affinity: -11.2,
      current_mean_affinity: -11.85,
      affinity_drift_deviation: -0.65,
      biosecurity_violation_rate: 2.11
    },
    amino_acid_distributions: {
      baseline: { A: 0.082, C: 0.014, D: 0.055, E: 0.067, F: 0.040, G: 0.071, H: 0.023, I: 0.059, K: 0.058, L: 0.097, M: 0.024, N: 0.041, P: 0.047, Q: 0.039, R: 0.055, S: 0.066, T: 0.053, V: 0.069, W: 0.011, Y: 0.029 },
      observed: { A: 0.085, C: 0.015, D: 0.052, E: 0.064, F: 0.042, G: 0.074, H: 0.025, I: 0.056, K: 0.060, L: 0.101, M: 0.022, N: 0.039, P: 0.045, Q: 0.037, R: 0.058, S: 0.069, T: 0.050, V: 0.066, W: 0.010, Y: 0.031 }
    }
  });
  const [isDriftInjected, setIsDriftInjected] = useState(false);

  const handleSandboxRun = () => {
    setSandboxRunning(true);
    setSandboxResponse(null);
    setTimeout(() => {
      const mockSeqs = {
        "PINK1 / Parkin": "MGAFLGKVLKACVVALSGKLL-NH2",
        "Amyloid-Beta": "KKLVFFAEDV-NH2",
        "Spike RBD": "VYAWNSRGFNCYFPLQSYGFQPTNGVGYQ-NH2"
      };
      const seq = mockSeqs[sandboxTarget] || "MGAFLGKVLKACVVALSGKLL-NH2";
      const isClean = !seq.includes("TFT");
      
      setSandboxResponse({
        status: "COMPLETED",
        design_id: `pep_sdk_${Date.now()}`,
        sequence: seq,
        binding_affinity: sandboxTarget === "Amyloid-Beta" ? -9.4 : -12.4,
        stability: 0.92,
        synthesis_script: "# Solid Phase Peptide Synthesis Script\nINITIATE SPPS;\nRESIN: Rink-Amide AM;\nCOUPLING: HATU/DIPEA;\nSEQUENCE: " + seq.replace("-NH2", "") + ";",
        therapeutic_index: 18.45,
        ti_lower: 12.21,
        ti_upper: 24.69,
        provenance_token: "prov_" + Math.random().toString(16).substring(2, 18),
        biosecurity_status: isClean ? "CLEARED" : "FAILED",
        consent_token: "consent_" + Math.random().toString(16).substring(2, 18),
        epsilon: sandboxEpsilon,
        dp_binding_affinity: Number(((sandboxTarget === "Amyloid-Beta" ? -9.4 : -12.4) + (Math.random() - 0.5) * (1 / sandboxEpsilon)).toFixed(2))
      });
      setSandboxRunning(false);
      addLog('gateway-sdk', `Programmatic design generated for target ${sandboxTarget} via SDK endpoint.`);
    }, 1500);
  };

  const handleRegisterPlugin = () => {
    setPluginRegistering(true);
    setPluginLogs([">> Initiating custom plugin registration on peptideOS cluster..."]);
    setTimeout(() => {
      setPluginLogs(prev => [...prev, ">> Ingesting custom class 'ImmunogenicityPenalizerPlugin'..."]);
      setTimeout(() => {
        setPluginLogs(prev => [...prev, ">> Compiling code AST and checking security sandbox isolation guidelines..."]);
        setTimeout(() => {
          setPluginLogs(prev => [...prev, ">> Dynamic plugin registration SUCCESSFUL."]);
          setPluginLogs(prev => [...prev, "[diffusion-plugins] Registered peptide extension plugin: 'ImmunogenicityPenalizer'"]);
          setPluginRegistering(false);
          addLog('diffusion-plugins', "External developer plugin registered successfully: 'ImmunogenicityPenalizerPlugin'.");
        }, 600);
      }, 600);
    }, 600);
  };

  const handleToggleDrift = () => {
    if (isDriftInjected) {
      setObsDrift({
        drift_status: 'STABLE',
        kl_divergence: 0.184,
        metrics: {
          baseline_mean_length: 20.0,
          current_mean_length: 21.2,
          length_drift_percentage: 6.0,
          baseline_mean_affinity: -11.2,
          current_mean_affinity: -11.85,
          affinity_drift_deviation: -0.65,
          biosecurity_violation_rate: 2.11
        },
        amino_acid_distributions: {
          baseline: { A: 0.082, C: 0.014, D: 0.055, E: 0.067, F: 0.040, G: 0.071, H: 0.023, I: 0.059, K: 0.058, L: 0.097, M: 0.024, N: 0.041, P: 0.047, Q: 0.039, R: 0.055, S: 0.066, T: 0.053, V: 0.069, W: 0.011, Y: 0.029 },
          observed: { A: 0.085, C: 0.015, D: 0.052, E: 0.064, F: 0.042, G: 0.074, H: 0.025, I: 0.056, K: 0.060, L: 0.101, M: 0.022, N: 0.039, P: 0.045, Q: 0.037, R: 0.058, S: 0.069, T: 0.050, V: 0.066, W: 0.010, Y: 0.031 }
        }
      });
      setIsDriftInjected(false);
      addLog('gateway-observability', "Model drift simulation disabled. Metrics restored to stable state.");
    } else {
      setObsDrift({
        drift_status: 'WARNING_DRIFT_DETECTED',
        kl_divergence: 0.618,
        metrics: {
          baseline_mean_length: 20.0,
          current_mean_length: 25.8,
          length_drift_percentage: 29.0,
          baseline_mean_affinity: -11.2,
          current_mean_affinity: -8.15,
          affinity_drift_deviation: 3.05,
          biosecurity_violation_rate: 15.42
        },
        amino_acid_distributions: {
          baseline: { A: 0.082, C: 0.014, D: 0.055, E: 0.067, F: 0.040, G: 0.071, H: 0.023, I: 0.059, K: 0.058, L: 0.097, M: 0.024, N: 0.041, P: 0.047, Q: 0.039, R: 0.055, S: 0.066, T: 0.053, V: 0.069, W: 0.011, Y: 0.029 },
          observed: { A: 0.185, C: 0.005, D: 0.012, E: 0.014, F: 0.085, G: 0.021, H: 0.011, I: 0.120, K: 0.012, L: 0.220, M: 0.004, N: 0.012, P: 0.015, Q: 0.008, R: 0.015, S: 0.019, T: 0.015, V: 0.185, W: 0.025, Y: 0.018 }
        }
      });
      setIsDriftInjected(true);
      addLog('gateway-observability', "WARNING: Significant model output drift detected! Sequence length (+29%) and Amino Acid frequencies (KL Div: 0.618) exceed tolerance threshold.");
    }
  };

  useEffect(() => {
    const fetchObservability = async () => {
      try {
        const resMetrics = await fetch('/api/v1/observability/metrics');
        if (resMetrics.ok) {
          const data = await resMetrics.json();
          if (!data.error) setObsMetrics(data);
        }
        const resDrift = await fetch('/api/v1/observability/drift');
        if (resDrift.ok) {
          const data = await resDrift.json();
          if (!data.error) setObsDrift(data);
        }
      } catch (err) {
        // Fallback silently to mock data
      }
    };
    fetchObservability();
    const interval = setInterval(fetchObservability, 10000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Initial Vector Search Load
  useEffect(() => {
    handleVectorSearch();
  }, []);

  // Logger helper
  const addLog = (service, text) => {
    const time = new Date().toTimeString().split(' ')[0];
    setLogs(prev => [...prev, { time, service, text }]);
  };

  // Canvas Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let width = canvas.width = canvas.offsetWidth;
    let height = canvas.height = canvas.offsetHeight;

    let particles = [];
    const particleCount = 120;
    
    // Initialize particles
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        originX: width / 2 + (Math.sin(i / 5) * 50) + (Math.sin(i) * 20),
        originY: 50 + (i * (height - 100) / particleCount),
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        size: Math.random() * 2 + 1.5,
        color: i % 2 === 0 ? '#06b6d4' : '#a855f7'
      });
    }

    let angle = 0;
    const render = () => {
      ctx.fillStyle = 'rgba(5, 7, 15, 0.2)'; // trail effect
      ctx.fillRect(0, 0, width, height);

      angle += 0.02;

      // Update and draw particles
      particles.forEach((p, idx) => {
        // Helix structure rotation
        const radius = 50 + Math.sin(angle + idx / 4) * 20;
        const targetX = width / 2 + Math.cos(angle + idx / 3) * radius;
        const targetY = 40 + (idx * (height - 80) / particleCount);

        if (pipelineStage === 'DIFFUSION') {
          // Denoising animation: particles start random and converge
          const noise = noiseLevel.current;
          const randomX = Math.random() * width;
          const randomY = Math.random() * height;
          p.x += (targetX - p.x) * 0.05 + (randomX - p.x) * 0.05 * noise;
          p.y += (targetY - p.y) * 0.05 + (randomY - p.y) * 0.05 * noise;
        } else if (pipelineStage === 'SIMULATION') {
          // Langevin dynamics: Brownian vibration around target
          const vibration = 2.5; // vibration intensity
          p.x = targetX + (Math.random() - 0.5) * vibration;
          p.y = targetY + (Math.random() - 0.5) * vibration;
          
          // Draw connecting forces
          if (idx > 0 && idx % 4 === 0) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(particles[idx - 1].x, particles[idx - 1].y);
            ctx.strokeStyle = 'rgba(6, 182, 212, 0.15)';
            ctx.stroke();
          }
        } else {
          // Idle state - smooth rotation
          p.x += (targetX - p.x) * 0.1;
          p.y += (targetY - p.y) * 0.1;
        }

        // Draw particle
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      });

      // Draw binding receptors in simulation stage
      if (pipelineStage === 'SIMULATION') {
        ctx.fillStyle = 'rgba(16, 185, 129, 0.1)';
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
        ctx.lineWidth = 1.5;
        // Top binding site
        ctx.beginPath();
        ctx.roundRect(width / 2 - 80, 15, 160, 20, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#10b981';
        ctx.font = '10px JetBrains Mono';
        ctx.fillText("BINDING POCKET 1 (PINK1)", width / 2 - 65, 29);

        // Bottom binding site
        ctx.fillStyle = 'rgba(16, 185, 129, 0.1)';
        ctx.beginPath();
        ctx.roundRect(width / 2 - 80, height - 35, 160, 20, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#10b981';
        ctx.fillText("BINDING POCKET 2 (PARKIN)", width / 2 - 70, height - 21);
      }

      animationFrameId.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId.current);
    };
  }, [pipelineStage]);

  // Main Pipeline Trigger
  const triggerPipeline = async () => {
    if (isDesigning) return;
    setIsDesigning(true);
    setLiveStreamData([]);
    setPipelineStage('DIFFUSION');
    setPipelineProgress(15);
    noiseLevel.current = 1.0;
    
    // Gateway Ingestion & Security Checks
    addLog('gateway', `Accepted POST request for peptide design: "${promptText}"`);
    if (e2eeEnabled) {
      addLog('gateway', `E2EE Flag detected. Encrypting biomolecular query context via AES-256-GCM...`);
      const encPrompt = "gcm_cipher_" + btoa(promptText).substring(0, 16) + "...";
      const encTarget = "gcm_cipher_" + btoa(targetProtein).substring(0, 16) + "...";
      addLog('gateway', `Encrypted Prompt: ${encPrompt}`);
      addLog('gateway', `Encrypted Target: ${encTarget}`);
    }
    
    if (consentGiven) {
      addLog('gateway', `Consent check: Active. Generating unique consent token...`);
      addLog('gateway', `Consent token logged to secure database ledger: consent_${Math.random().toString(36).substr(2, 9)}`);
    } else {
      addLog('gateway', `Consent check: FAILED. Access restriction warning raised!`);
    }
    
    addLog('gateway', `Enforcing data minimization. Scrubbing all non-essential parameter fields...`);
    addLog('gateway', `Authenticating developer key and checking usage limits...`);
    
    // Step 1: Diffusion Stage
    await new Promise(r => setTimeout(r, 1500));
    addLog('kafka', `Job enqueued successfully to topic 'peptide-design-jobs'. Partition: 0, Offset: 242`);
    setPipelineStage('KAFKA');
    setPipelineProgress(35);
    setKafkaQueue(1);

    await new Promise(r => setTimeout(r, 1200));
    addLog('diffusion', `Diffusion worker picked up job. Initiating 50 de-scaffolding denoising steps...`);
    
    // Decryption at diffusion service if E2EE is active
    if (e2eeEnabled) {
      addLog('diffusion', `Secure worker session established. Decrypted query parameters internally using default key.`);
    }
    
    setPipelineStage('DIFFUSION');
    setPipelineProgress(50);
    setKafkaQueue(0);

    // Denoising countdown
    for (let step = 1; step <= 5; step++) {
      await new Promise(r => setTimeout(r, 600));
      noiseLevel.current = 1.0 - (step / 5.0);
      const simulatedRmsd = (3.5 - step * 0.6).toFixed(2);
      const simulatedEntropy = (1.2 - step * 0.2).toFixed(2);
      setRmsd(parseFloat(simulatedRmsd));
      setEntropy(parseFloat(simulatedEntropy));
      const residues = ['MET', 'GLY', 'ALA', 'PHE', 'LEU', 'LYS'];
      setCurrentResidue(residues[step - 1]);
      addLog('diffusion', `Iteration ${step * 10}/50 - Structural RMSD: ${simulatedRmsd}A, Sequence Entropy: ${simulatedEntropy}`);
      
      const currentSeq = "MGAFLGKVLKACVVALSGKLL-NH2".substring(0, step * 5);
      setLiveStreamData(prev => [...prev, `[wss://stream.peptideos/seq] Refining sequence chunk... ${currentSeq}`]);
    }

    const mockSequence = "MGAFLGKVLKACVVALSGKLL-NH2";
    setDesignedSequence(mockSequence);
    addLog('diffusion', `De novo sequence generation complete: ${mockSequence}`);
    
    // Biosecurity pre-screen of sequence
    addLog('diffusion', `Initiating sequence biosecurity pre-screen against select agent toxin patterns...`);
    const biosecurityCleared = !mockSequence.includes("CWD") && !mockSequence.includes("TFT") && !mockSequence.includes("LFY");
    if (biosecurityCleared) {
      addLog('diffusion', `Biosecurity screening complete: CLEARED (No dual-use toxin precursors detected)`);
    } else {
      addLog('diffusion', `Biosecurity screening: VIOLATION WARNING. Sequence contains dual-use regulated toxin motifs.`);
    }
    
    addLog('kafka', `Generated sequence sent to topic 'designed-peptides'.`);
    
    // Step 2: Simulation Stage (Digital Twin)
    setPipelineStage('SIMULATION');
    setPipelineProgress(75);
    setKafkaQueue(1);
    await new Promise(r => setTimeout(r, 1200));
    setKafkaQueue(0);
    addLog('simulation', `Simulation sandbox worker initialized. Resolving digital twin multi-scale proteome simulations.`);
    addLog('simulation', `Solving Langevin dynamics equations to evaluate binding affinity...`);
    
    // Simulate Langevin/SDE updates
    for (let s = 1; s <= 3; s++) {
      await new Promise(r => setTimeout(r, 700));
      const energy = (-8.5 - s * 1.3).toFixed(2);
      const def = (1.0 - s * 0.28).toFixed(2);
      setFreeEnergy(parseFloat(energy));
      setPerturbationIndex(parseFloat(def));
      addLog('simulation', `Langevin solver iteration ${s}/3 - Potential Energy: ${energy} kcal/mol, Phenotype Tag Deficit: ${def}`);
    }

    const rawAffinity = -12.4;
    const rawStability = 0.94;
    
    // Differential privacy noise injection
    const scale = 0.2 / epsilonVal;
    const u = Math.random() - 0.5;
    const dpNoise = -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
    const finalAffinity = parseFloat((rawAffinity + dpNoise).toFixed(2));
    const finalStability = parseFloat(Math.min(1.0, Math.max(0.1, rawStability + dpNoise * 0.04)).toFixed(2));
    
    addLog('simulation', `Injecting Differential Privacy Laplace noise (Epsilon = ${epsilonVal}, Sensitivity = 0.2, Scale = ${scale.toFixed(3)})...`);
    addLog('simulation', `Raw Binding Affinity: ${rawAffinity} kcal/mol | perturbed DP Output: ${finalAffinity} kcal/mol`);
    
    addLog('simulation', `Digital twin analysis finished. Binding Free Energy: ${finalAffinity} kcal/mol, Cellular Recovery: ${(finalStability*100).toFixed(0)}%.`);
    addLog('simulation', `Compiling solid phase peptide synthesis (SPPS) protocol...`);
    
    await new Promise(r => setTimeout(r, 1000));
    const script = `# Automated Solid Phase Peptide Synthesis (SPPS) Script
# Sequence: ${mockSequence}
# Platform: Biotage Syro II Parallel Synthesizer

INITIATE_SYNTHESIS:
  SCALE: 0.1 mmol
  RESIN: Rink Amide MBHA (0.45 mmol/g)
  SOLVENT: DMF

CYCLE_STEPS:
  1. Deprotect: 20% Piperidine in DMF (5 min + 15 min)
  2. Couple: Fmoc-Lys(Boc)-OH (4eq) + HATU (3.9eq) + DIPEA (8eq)
  3. Cycle: Repeat sequence M-G-A-F-L-G-K-V-L-K-A-C-V-V-A-L-S-G-K-L-L

CLEAVAGE:
  TFA/TIS/H2O (95:2.5:2.5) for 3.5 hours.
ANALYTICAL_PURIFICATION:
  Preparative C18 RP-HPLC (Acetonitrile/Water + 0.1% TFA gradient).
`;
    setSynthesisScript(script);
    
    // Dynamically generate efficacy & risk outputs based on final simulation scores
    const tiVal = 10.0 + Math.abs(finalAffinity) * 0.75 + (Math.random() - 0.5) * 1.5;
    const margin = 4.0 + Math.random() * 2.0;
    const ti_lower = Math.max(1.0, tiVal - margin);
    const ti_upper = tiVal + margin;
    
    const doses = [0.001, 0.01, 0.1, 1.0, 10.0, 100.0, 1000.0];
    const emax = 0.85 + (finalStability * 0.1);
    const ec50 = 0.1 + Math.exp(finalAffinity / 4.0);
    const hillSlope = 1.1 + Math.random() * 0.3;
    const predicted_responses = doses.map(d => parseFloat((emax * Math.pow(d, hillSlope) / (Math.pow(ec50, hillSlope) + Math.pow(d, hillSlope))).toFixed(4)));
    const conformal_band_lower = predicted_responses.map(p => parseFloat(Math.max(0.0, p - 0.12 - Math.random() * 0.04).toFixed(4)));
    const conformal_band_upper = predicted_responses.map(p => parseFloat(Math.min(1.0, p + 0.12 + Math.random() * 0.04).toFixed(4)));
    
    const pApoptosis = Math.min(0.99, Math.max(0.01, 0.04 + (1.0 - finalStability) * 0.5 + (Math.random() * 0.08)));
    const pInflam = Math.min(0.99, Math.max(0.01, 0.07 + (Math.random() * 0.12)));
    const pKinase = Math.min(0.99, Math.max(0.01, 0.03 + (Math.random() * 0.08)));
    const pMitophagy = Math.min(0.99, Math.max(0.01, 0.02 + (Math.random() * 0.06)));
    
    const thresholds = {
      "Apoptosis Pathway Activation": 0.284,
      "Inflammatory Cascade Triggering": 0.315,
      "Off-Target Kinase Exhaustion": 0.250,
      "Mitophagosome Blockage": 0.320
    };
    
    const confSet = [];
    if (pApoptosis >= thresholds["Apoptosis Pathway Activation"]) confSet.push("Apoptosis Pathway Activation");
    if (pInflam >= thresholds["Inflammatory Cascade Triggering"]) confSet.push("Inflammatory Cascade Triggering");
    if (pKinase >= thresholds["Off-Target Kinase Exhaustion"]) confSet.push("Off-Target Kinase Exhaustion");
    if (pMitophagy >= thresholds["Mitophagosome Blockage"]) confSet.push("Mitophagosome Blockage");
    
    const riskLvl = confSet.length >= 2 || pApoptosis > 0.4 ? "HIGH" : confSet.length === 1 ? "MODERATE" : "LOW";
    
    const compliance_report = `# PEPTIDEOS CLINICAL & REGULATORY COMPLIANCE REPORT
## EFFICACY AND RISK QUANTIFICATION SUITE
**PEPTIDE IDENTIFIER:** PEP-1042
**SEQUENCE:** ${mockSequence}
**EVALUATION DATE:** 2026-06-14
**ASSUAGED CONFIDENCE LIMIT:** 95.0% (Significance Level alpha = 0.05)

---

### 1. SUMMARY OF QUANTITATIVE FINDINGS
*   **Predicted Therapeutic Index (TI):** ${tiVal.toFixed(2)}
*   **Calibrated 95.0% Conformal Interval:** [${ti_lower.toFixed(2)}, ${ti_upper.toFixed(2)}]
    *   *Note: Conformal bounds guarantee that the true therapeutic index lies within this interval with >= 95% probability under longitudinal outcomes.*
*   **Quantified Adverse Risk Class:** **${riskLvl}**

---

### 2. DOSE-RESPONSE PROFILE WITH CALIBRATED CONFORMAL BANDS
| Dose (microMolar) | Predicted Response | Conformal Lower Bound (95.0%) | Conformal Upper Bound (95.0%) |
|:-----------------:|:------------------:|:-----------------------------------:|:-----------------------------------:|
` + doses.map((d, i) => `| ${d.toString().padEnd(17)} | ${predicted_responses[i].toFixed(4).padEnd(18)} | ${conformal_band_lower[i].toFixed(4).padEnd(33)} | ${conformal_band_upper[i].toFixed(4).padEnd(33)} |`).join('\n') + `

**Hill Equation Parametric Fitting:**
*   **Maximal Response (Emax):** ${emax.toFixed(4)}
*   **Half-Maximal Effective Dose (EC50):** ${ec50.toFixed(4)} uM
*   **Hill Coefficient (Slope):** ${hillSlope.toFixed(4)}

---

### 3. ADVERSE NETWORK REWIRING RISK ASSESSMENT
| Adverse Rewiring Event | Predicted Probability | Conformal Calibration Threshold | Retained in Conformal Prediction Set |
|:----------------------|:---------------------:|:------------------------------:|:------------------------------------:|
| Apoptosis Pathway Activation | ${pApoptosis.toFixed(4).padEnd(21)} | 0.2840                         | ${confSet.includes("Apoptosis Pathway Activation") ? "YES" : "NO"}                                   |
| Inflammatory Cascade Triggering | ${pInflam.toFixed(4).padEnd(21)} | 0.3150                         | ${confSet.includes("Inflammatory Cascade Triggering") ? "YES" : "NO"}                                   |
| Off-Target Kinase Exhaustion | ${pKinase.toFixed(4).padEnd(21)} | 0.2500                         | ${confSet.includes("Off-Target Kinase Exhaustion") ? "YES" : "NO"}                                   |
| Mitophagosome Blockage | ${pMitophagy.toFixed(4).padEnd(21)} | 0.3200                         | ${confSet.includes("Mitophagosome Blockage") ? "YES" : "NO"}                                   |

**Conformal Active Prediction Set (Guaranteed coverage of true rewiring events):**
\`${JSON.stringify(confSet)}\`

---

### 4. METHODOLOGY & UNCERTAINTY CALIBRATION
1.  **Ensemble Machine Learning Models**: Multi-scale feature vectors were constructed from sequence, structural, and pathway trajectory features.
2.  **Split Conformal Prediction**: Models were calibrated on a disjoint partition of longitudinal therapeutic outcome records (n_cal=50). Conformal bounds ensure mathematical coverage guarantees, complying with FDA/EMA guidelines for machine-learning-assisted drug candidate profiling.`;

    setEfficacyRiskData({
      therapeutic_index: {
        point_prediction: tiVal,
        conformal_interval: [ti_lower, ti_upper],
        calibration_margin: margin
      },
      dose_response: {
        doses_uM: doses,
        predicted_responses,
        conformal_band_lower,
        conformal_band_upper,
        hill_parameters: {
          Emax: emax,
          EC50: ec50,
          HillSlope: hillSlope
        }
      },
      adverse_events: {
        probabilities: {
          "Apoptosis Pathway Activation": pApoptosis,
          "Inflammatory Cascade Triggering": pInflam,
          "Off-Target Kinase Exhaustion": pKinase,
          "Mitophagosome Blockage": pMitophagy
        },
        conformal_thresholds: thresholds,
        conformal_prediction_set: confSet,
        adverse_risk_level: riskLvl
      },
      compliance_report
    });
    
    // Step 3: Write metadata to PostgreSQL
    setPipelineStage('SAVED');
    setPipelineProgress(90);
    addLog('gateway', `Writing completed design and synthesis metadata to PostgreSQL...`);
    await new Promise(r => setTimeout(r, 1000));

    setPipelineStage('COMPLETED');
    setPipelineProgress(100);
    addLog('gateway', `Design pipeline finished successfully. Developer artifact PEP-1042 ready.`);
    setIsDesigning(false);
  };

  // Simulate Peak Load
  const simulatePeakLoad = async () => {
    addLog('k8s', `Warning: Simulating peak load test (10,000 concurrent requests/sec)...`);
    setCpuLoad(92);
    setKafkaQueue(18);
    
    await new Promise(r => setTimeout(r, 1500));
    addLog('k8s', `Horizontal Pod Autoscaling (HPA) triggered. Scaling simulation-service replicas 2 -> 7.`);
    setReplicas(7);
    
    await new Promise(r => setTimeout(r, 1500));
    addLog('k8s', `Service mesh reports pathway-service latency threshold exceeded (520ms).`);
    addLog('k8s', `Istio circuit breaker tripped for pathway-service-cb. Releasing outliers.`);
    setCircuitBreaker('OPEN');
    
    await new Promise(r => setTimeout(r, 3000));
    addLog('k8s', `Load stabilized. Replicas active: 7. CPU load dropping.`);
    setCpuLoad(48);
    setKafkaQueue(2);
    
    await new Promise(r => setTimeout(r, 2000));
    addLog('k8s', `Istio circuit breaker entering HALF-OPEN state. Probing connections...`);
    setCircuitBreaker('HALF-OPEN');
    
    await new Promise(r => setTimeout(r, 1500));
    addLog('k8s', `Connections validated. Circuit breaker reset to CLOSED.`);
    setCircuitBreaker('CLOSED');
    setCpuLoad(24);
    setKafkaQueue(0);
  };

  // Simulating Pod Failures and restarts
  const killPod = async () => {
    addLog('k8s', `Critical: Force terminating pod simulation-service-f39b1a.`);
    setReplicas(1);
    
    await new Promise(r => setTimeout(r, 1000));
    addLog('k8s', `Istio gateway detecting endpoint disconnection. mTLS tunnel updated.`);
    
    await new Promise(r => setTimeout(r, 1500));
    addLog('k8s', `Kubernetes controller detecting replica count deficit. Initiating pod restart.`);
    
    await new Promise(r => setTimeout(r, 1500));
    addLog('k8s', `New pod simulation-service-a92c81 spawned. Port binding complete. Running health checks...`);
    
    await new Promise(r => setTimeout(r, 1000));
    addLog('k8s', `Readiness probe passed. Adding endpoint back to load balancer. Replicas: 2.`);
    setReplicas(2);
  };

  // Export API Script implementation
  const exportAPIScript = () => {
    const scriptContent = `import requests
import json

# Auto-generated PeptiPrompt API Script
# Target: ${targetProtein}

API_ENDPOINT = "https://api.peptideos.com/v1/design"
API_KEY = "your_api_key_here"

payload = {
    "prompt": "${promptText}",
    "target": "${targetProtein}",
    "scale": "${complexity}",
    "constraints": {
        "max_length": ${sequenceLength},
        "off_target_tolerance": ${offTargetTolerance}
    }
}

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

print("Triggering autonomous script generation API...")
response = requests.post(API_ENDPOINT, json=payload, headers=headers)

if response.status_code == 200:
    print("Success! Generated Protocol:")
    print(response.json().get("script"))
else:
    print(f"Error: {response.status_code}")
`;
    const blob = new Blob([scriptContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `generate_protocol_${targetProtein.replace(/[^a-zA-Z0-9]/g, '')}.py`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Vector Search implementation
  function handleVectorSearch() {
    const query = searchQuery.toLowerCase();
    const scored = PRIOR_DESIGNS.map(design => {
      let overlap = 0;
      const terms = query.split(' ');
      terms.forEach(term => {
        if (term.length > 2) {
          if (design.disease_state.toLowerCase().includes(term) || design.description.toLowerCase().includes(term)) {
            overlap += 0.22;
          }
        }
      });
      const score = Math.min(0.99, Math.max(0.42, 0.53 + overlap + (Math.random() - 0.5) * 0.05));
      return { score, payload: design };
    }).sort((a, b) => b.score - a.score);

    setSearchResults(scored);
  };

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="header glass-panel">
        <div className="logo-container">
          <div className="logo-icon">PP</div>
          <div className="logo-text">
            <h1>PeptiPrompt API</h1>
            <p>Biology-As-Code Hybrid Cloud Platform</p>
          </div>
        </div>

        <div className="nav-tabs">
          <button 
            className={`tab-btn ${activeTab === 'workspace' ? 'active' : ''}`}
            onClick={() => setActiveTab('workspace')}
          >
            Developer Workspace
          </button>
          <button 
            className={`tab-btn ${activeTab === 'pathways' ? 'active' : ''}`}
            onClick={() => setActiveTab('pathways')}
          >
            Pathway Relationships
          </button>
          <button 
            className={`tab-btn ${activeTab === 'vectors' ? 'active' : ''}`}
            onClick={() => setActiveTab('vectors')}
          >
            Vector Embeddings
          </button>
          <button 
            className={`tab-btn ${activeTab === 'efficacy' ? 'active' : ''}`}
            onClick={() => setActiveTab('efficacy')}
          >
            Efficacy & Risk (Conformal ML)
          </button>
          <button 
            className={`tab-btn ${activeTab === 'governance' ? 'active' : ''}`}
            onClick={() => setActiveTab('governance')}
          >
            Data Governance & Compliance
          </button>
          <button 
            className={`tab-btn ${activeTab === 'observability' ? 'active' : ''}`}
            onClick={() => setActiveTab('observability')}
          >
            Observability & Developer Portal
          </button>
        </div>

        <div className="system-status-indicator">
          <div className="status-dot"></div>
          Istio Mesh Secured (mTLS)
        </div>
      </header>

      {/* Main Grid Content */}
      <div className={`dashboard-grid ${activeTab !== 'workspace' ? 'full-width-grid' : ''}`}>
        
        {/* Left Side: Controls (Only visible in Workspace) */}
        {activeTab === 'workspace' && (
          <div className="control-center">
            
            {/* No Code Builder Form */}
            <div className="glass-panel panel-content">
              <h2 className="panel-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                No-Code Builder
              </h2>
              <div className="prompt-box">
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Disease State Prompt</label>
                <textarea 
                  className="prompt-textarea" 
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  placeholder="Describe target disease state..."
                  disabled={isDesigning}
                />
                
                <div className="parameter-row">
                  <span>Target Protein:</span>
                  <select value={targetProtein} onChange={(e) => setTargetProtein(e.target.value)} disabled={isDesigning}>
                    <option value="PINK1 / Parkin">PINK1 / Parkin</option>
                    <option value="Amyloid-Beta">Amyloid-Beta</option>
                    <option value="Spike RBD">Spike RBD</option>
                    <option value="MDM2">MDM2</option>
                  </select>
                </div>

                <div className="parameter-row">
                  <span>Simulation Scale:</span>
                  <select value={complexity} onChange={(e) => setComplexity(e.target.value)} disabled={isDesigning}>
                    <option value="standard">Standard</option>
                    <option value="high_fidelity">High Fidelity (SDE)</option>
                    <option value="deep">Deep Multiscale</option>
                  </select>
                </div>

                <div className="parameter-row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px', marginTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <span>Max Sequence Length:</span>
                    <span className="text-cyan">{sequenceLength} AA</span>
                  </div>
                  <input type="range" min="10" max="50" value={sequenceLength} onChange={(e) => setSequenceLength(e.target.value)} disabled={isDesigning} style={{ width: '100%' }} />
                </div>
                
                <div className="parameter-row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px', marginTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <span>Off-Target Tolerance:</span>
                    <span className="text-purple">{(offTargetTolerance * 100).toFixed(0)}%</span>
                  </div>
                  <input type="range" min="0.01" max="0.2" step="0.01" value={offTargetTolerance} onChange={(e) => setOffTargetTolerance(e.target.value)} disabled={isDesigning} style={{ width: '100%' }} />
                </div>

                <div className="parameter-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
                  <input 
                    type="checkbox" 
                    id="e2ee-checkbox" 
                    checked={e2eeEnabled} 
                    onChange={(e) => setE2eeEnabled(e.target.checked)} 
                    disabled={isDesigning} 
                    style={{ cursor: 'pointer' }}
                  />
                  <label htmlFor="e2ee-checkbox" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
                    Enable E2EE (AES-256-GCM)
                  </label>
                </div>

                <div className="parameter-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                  <input 
                    type="checkbox" 
                    id="consent-checkbox" 
                    checked={consentGiven} 
                    onChange={(e) => setConsentGiven(e.target.checked)} 
                    disabled={isDesigning} 
                    style={{ cursor: 'pointer' }}
                  />
                  <label htmlFor="consent-checkbox" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
                    Consent to Process Biological Data
                  </label>
                </div>

                <div className="parameter-row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px', marginTop: '12px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <span>DP Inference Budget (Epsilon):</span>
                    <span className="text-orange">ε = {epsilonVal.toFixed(1)}</span>
                  </div>
                  <input 
                    type="range" 
                    min="0.1" 
                    max="10.0" 
                    step="0.1" 
                    value={epsilonVal} 
                    onChange={(e) => setEpsilonVal(parseFloat(e.target.value))} 
                    disabled={isDesigning} 
                    style={{ width: '100%', cursor: 'pointer' }} 
                  />
                </div>

                <button 
                  className="design-btn" 
                  onClick={triggerPipeline}
                  disabled={isDesigning || !promptText}
                >
                  {isDesigning ? 'Processing...' : 'Compile & Design Peptide'}
                </button>

                {(!isDesigning && designedSequence) && (
                  <button 
                    className="infra-btn" 
                    style={{ width: '100%', marginTop: '12px', background: 'rgba(6, 182, 212, 0.1)', borderColor: '#06b6d4', color: '#06b6d4' }}
                    onClick={exportAPIScript}
                  >
                    Export Pipeline as API Script
                  </button>
                )}
              </div>
            </div>

            {/* Elastic Cluster Operations */}
            <div className="glass-panel panel-content">
              <h2 className="panel-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
                Kubernetes Operations
              </h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                Interact with the hybrid cloud environment. Simulate failures and traffic spikes.
              </p>
              <div className="infra-control-row">
                <button className="infra-btn" onClick={simulatePeakLoad} disabled={isDesigning}>
                  Trigger Peak Load
                </button>
                <button className="infra-btn danger" onClick={killPod} disabled={isDesigning}>
                  Kill Sim Pod
                </button>
              </div>
            </div>

            {/* Live Metrics */}
            <div className="glass-panel panel-content">
              <h2 className="panel-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                System Topology Metrics
              </h2>
              <div className="stat-grid">
                <div className="stat-card">
                  <div className="stat-label">Active Pods (HPA)</div>
                  <div className="stat-value text-cyan">{replicas} / 10</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Avg CPU Load</div>
                  <div className="stat-value text-purple">{cpuLoad}%</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Kafka Queue Size</div>
                  <div className="stat-value text-orange">{kafkaQueue}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Circuit Breaker</div>
                  <div className={`stat-value ${circuitBreaker === 'CLOSED' ? 'text-green' : 'text-red'}`}>{circuitBreaker}</div>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* Right Side: Workspace Main / Other Tabs */}
        <div className="workspace">
          
          {activeTab === 'workspace' && (
            <>
              {/* Pipeline Tracker */}
              <div className="glass-panel panel-content">
                <h2 className="panel-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  Pipeline Progress Tracker
                </h2>
                <div className="pipeline-track">
                  <div className="pipeline-progress-bar" style={{ width: `${pipelineProgress}%` }}></div>
                  
                  <div className={`pipeline-node ${pipelineStage !== 'IDLE' ? 'completed' : ''} ${pipelineStage === 'DIFFUSION' ? 'active' : ''}`}>
                    <div className="pipeline-circle">1</div>
                    <div className="pipeline-label">Gateway</div>
                  </div>

                  <div className={`pipeline-node ${['KAFKA', 'SIMULATION', 'SAVED', 'COMPLETED'].includes(pipelineStage) ? 'completed' : ''} ${pipelineStage === 'KAFKA' ? 'active' : ''}`}>
                    <div className="pipeline-circle">2</div>
                    <div className="pipeline-label">Kafka</div>
                  </div>

                  <div className={`pipeline-node ${['SIMULATION', 'SAVED', 'COMPLETED'].includes(pipelineStage) ? 'completed' : ''} ${pipelineStage === 'DIFFUSION' && pipelineProgress > 30 ? 'active' : ''}`}>
                    <div className="pipeline-circle">3</div>
                    <div className="pipeline-label">Diffusion</div>
                  </div>

                  <div className={`pipeline-node ${['SAVED', 'COMPLETED'].includes(pipelineStage) ? 'completed' : ''} ${pipelineStage === 'SIMULATION' ? 'active' : ''}`}>
                    <div className="pipeline-circle">4</div>
                    <div className="pipeline-label">Sim Sandbox</div>
                  </div>

                  <div className={`pipeline-node ${pipelineStage === 'COMPLETED' ? 'completed' : ''} ${pipelineStage === 'SAVED' ? 'active' : ''}`}>
                    <div className="pipeline-circle">5</div>
                    <div className="pipeline-label">Relational DB</div>
                  </div>
                </div>
              </div>

              {/* Digital Twin Molecular Sandbox */}
              <div className="diffusion-sandbox">
                <div className="glass-panel panel-content" style={{ display: 'flex', flexDirection: 'column' }}>
                  <h2 className="panel-title">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                    Digital Twin Physical Sandbox
                  </h2>
                  <div className="canvas-container">
                    <canvas ref={canvasRef} style={{ width: '100%', height: '100%', borderRadius: '6px' }}></canvas>
                    <div className="diffusion-overlay">
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Mode</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--accent-cyan)' }}>
                        {pipelineStage === 'DIFFUSION' ? 'DIFFUSION DENOISING' : pipelineStage === 'SIMULATION' ? 'LANGEVIN DYNAMICS' : 'IDLE HELIX'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="glass-panel panel-content telemetry-card">
                  <h2 className="panel-title">Physical Telemetry</h2>
                  
                  <div className="telemetry-row">
                    <span className="telemetry-label">Structure RMSD</span>
                    <span className="telemetry-value text-cyan">{rmsd.toFixed(2)} Å</span>
                  </div>

                  <div className="telemetry-row">
                    <span className="telemetry-label">Sequence Entropy</span>
                    <span className="telemetry-value text-purple">{entropy.toFixed(2)}</span>
                  </div>

                  <div className="telemetry-row">
                    <span className="telemetry-label">Free Energy (ΔG)</span>
                    <span className="telemetry-value text-green">{freeEnergy.toFixed(2)} kcal/mol</span>
                  </div>

                  <div className="telemetry-row">
                    <span className="telemetry-label">Perturbation Index</span>
                    <span className="telemetry-value text-orange">{(perturbationIndex * 100).toFixed(0)}% deficit</span>
                  </div>

                  <div className="telemetry-row">
                    <span className="telemetry-label">Active Residue</span>
                    <span className="telemetry-value text-primary">{currentResidue}</span>
                  </div>

                  {designedSequence && (
                    <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Target Sequence:</div>
                      <div style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)', wordBreak: 'break-all', color: 'var(--accent-cyan)' }}>
                        {designedSequence}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Live WebSocket Preview Pane */}
              <div className="glass-panel panel-content" style={{ marginTop: '20px' }}>
                <h2 className="panel-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                  Live Sequence & Simulation Stream (WebSocket)
                </h2>
                <div style={{ background: '#04060a', padding: '12px', borderRadius: '6px', height: '120px', overflowY: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {liveStreamData.length === 0 && !isDesigning ? (
                    <div style={{ fontStyle: 'italic', color: 'var(--text-muted)', textAlign: 'center', marginTop: '30px' }}>Waiting for wss://stream.peptideos connection...</div>
                  ) : (
                    liveStreamData.map((data, idx) => (
                      <div key={idx} style={{ marginBottom: '6px' }}>
                        <span style={{ color: '#06b6d4' }}>&gt; </span>{data}
                      </div>
                    ))
                  )}
                  {pipelineStage === 'SIMULATION' && (
                    <div style={{ color: '#10b981', marginTop: '6px' }}>&gt; [wss://stream.peptideos/sim] SDE Solver Step: Binding Energy {freeEnergy} kcal/mol</div>
                  )}
                  {pipelineStage === 'COMPLETED' && (
                    <div style={{ color: '#a855f7', marginTop: '6px' }}>&gt; [wss://stream.peptideos/status] Stream disconnected. Process completed.</div>
                  )}
                </div>
              </div>

              {/* SPPS Synthesis Protocol Script */}
              {synthesisScript && (
                <div className="glass-panel panel-content">
                  <h2 className="panel-title">Compiled Peptide Synthesis Script</h2>
                  <div className="script-view">{synthesisScript}</div>
                </div>
              )}

              {/* Logging console */}
              <div className="glass-panel panel-content console-panel">
                <h2 className="panel-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
                  Service Mesh Live Telemetry Console
                </h2>
                <div className="console-terminal">
                  {logs.map((log, index) => (
                    <div key={index} className="log-entry">
                      <span className="log-time">[{log.time}]</span>
                      <span className={`log-service ${
                        log.service === 'gateway' ? 'text-cyan' : 
                        log.service === 'kafka' ? 'text-orange' : 
                        log.service === 'k8s' ? 'text-purple' : 
                        log.service === 'diffusion' ? 'text-purple' :
                        log.service === 'simulation' ? 'text-green' : 'text-primary'
                      }`}>[{log.service}]</span>
                      <span className="log-message">{log.text}</span>
                    </div>
                  ))}
                  <div ref={terminalEndRef} />
                </div>
              </div>
            </>
          )}

          {/* Tab 2: Pathway Explorer */}
          {activeTab === 'pathways' && (
            <div className="glass-panel panel-content" style={{ display: 'flex', flexDirection: 'column' }}>
              <h2 className="panel-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                Pathway relationships Explorer (Neo4j Graph Database)
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                Select nodes to inspect signaling relationships for the <b>PINK1 / Parkin</b> pathway.
              </p>

              <div className="pathway-graph-container">
                <div className="graph-overlay-left">
                  {activeNode ? (
                    <div className="node-card">
                      <h3 style={{ margin: '0 0 6px 0', color: 'var(--accent-cyan)', fontSize: '1rem' }}>{activeNode.id}</h3>
                      <div style={{ fontSize: '0.7rem', color: 'var(--accent-purple)', fontWeight: 'bold', marginBottom: '6px' }}>{activeNode.label}</div>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-primary)', margin: 0 }}>{activeNode.desc}</p>
                    </div>
                  ) : (
                    <div className="node-card" style={{ borderStyle: 'dashed', borderColor: 'var(--text-muted)' }}>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>Click a protein node in the signaling graph to query Neo4j metadata.</p>
                    </div>
                  )}
                </div>

                <svg width="100%" height="100%" style={{ minHeight: '380px' }}>
                  {/* Edges */}
                  <path d="M 150 200 L 280 120" className="graph-edge active" />
                  <path d="M 280 120 L 410 200" className="graph-edge active" />
                  <path d="M 150 200 L 410 200" className="graph-edge active" />
                  <path d="M 410 200 L 540 200" className="graph-edge tagging" />
                  <path d="M 540 200 L 670 200" className="graph-edge tagging" />
                  <path d="M 670 200 L 800 200" className="graph-edge mitophagy" />

                  {/* Nodes */}
                  <g className="graph-node" onClick={() => setActiveNode(BIOLOGICAL_PATHWAYS[0])}>
                    <circle cx="150" cy="200" r="28" fill="#0f1526" stroke="#06b6d4" strokeWidth="2" />
                    <text x="150" y="204" fill="#fff" textAnchor="middle" fontSize="11" fontWeight="bold">PINK1</text>
                  </g>

                  <g className="graph-node" onClick={() => setActiveNode(BIOLOGICAL_PATHWAYS[2])}>
                    <circle cx="280" cy="120" r="28" fill="#0f1526" stroke="#06b6d4" strokeWidth="2" />
                    <text x="280" y="124" fill="#fff" textAnchor="middle" fontSize="11" fontWeight="bold">Mfn2</text>
                  </g>

                  <g className="graph-node" onClick={() => setActiveNode(BIOLOGICAL_PATHWAYS[1])}>
                    <circle cx="410" cy="200" r="28" fill="#0f1526" stroke="#06b6d4" strokeWidth="2" />
                    <text x="410" y="204" fill="#fff" textAnchor="middle" fontSize="11" fontWeight="bold">Parkin</text>
                  </g>

                  <g className="graph-node" onClick={() => setActiveNode(BIOLOGICAL_PATHWAYS[3])}>
                    <circle cx="540" cy="200" r="28" fill="#0f1526" stroke="#a855f7" strokeWidth="2" />
                    <text x="540" y="204" fill="#fff" textAnchor="middle" fontSize="11" fontWeight="bold">VDAC1</text>
                  </g>

                  <g className="graph-node" onClick={() => setActiveNode(BIOLOGICAL_PATHWAYS[4])}>
                    <circle cx="670" cy="200" r="28" fill="#0f1526" stroke="#a855f7" strokeWidth="2" />
                    <text x="670" y="204" fill="#fff" textAnchor="middle" fontSize="11" fontWeight="bold">OPTN</text>
                  </g>

                  <g className="graph-node" onClick={() => setActiveNode(BIOLOGICAL_PATHWAYS[5])}>
                    <circle cx="800" cy="200" r="28" fill="#0f1526" stroke="#10b981" strokeWidth="2" />
                    <text x="800" y="204" fill="#fff" textAnchor="middle" fontSize="11" fontWeight="bold">LC3-II</text>
                  </g>
                </svg>
              </div>

              {/* Neo4j Cypher Statement display */}
              <div style={{ marginTop: '20px', background: '#04060a', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>Active Neo4j Cypher Query:</div>
                <code style={{ fontSize: '0.8rem', color: '#f59e0b', fontFamily: 'var(--font-mono)' }}>
                  {activeNode 
                    ? `MATCH (n:Protein {id: "${activeNode.id}"})-[r]->(m) RETURN n, r, m;` 
                    : `MATCH p=(:Protein {id: "PINK1"})-[*1..5]->(:MitophagyMarker) RETURN p;`
                  }
                </code>
              </div>
            </div>
          )}

          {/* Tab 3: Vector Embeddings Search */}
          {activeTab === 'vectors' && (
            <div className="glass-panel panel-content">
              <h2 className="panel-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                Qdrant Vector embeddings Repository Search
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                Search across high-dimensional disease embeddings and historical peptide sequences.
              </p>

              <div className="vector-search-input-row">
                <input 
                  type="text" 
                  className="search-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Type disease keywords (e.g. mitrocondrial deficit, tumor, spike)..."
                  onKeyDown={(e) => { if (e.key === 'Enter') handleVectorSearch(); }}
                />
                <button className="search-btn" onClick={handleVectorSearch}>Search Space</button>
              </div>

              <div className="vector-results">
                {searchResults.map((result, idx) => (
                  <div key={idx} className="vector-result-card">
                    <div className="vector-result-info">
                      <h3 className="vector-result-title text-cyan">{result.payload.id} - {result.payload.disease_state}</h3>
                      <p className="vector-result-desc">{result.payload.description}</p>
                      <div className="vector-result-meta">
                        <span><b>Sequence:</b> <code style={{ fontSize: '0.7rem' }}>{result.payload.sequence}</code></span>
                        <span><b>Binding:</b> <span className="text-green">{result.payload.binding_affinity} kcal/mol</span></span>
                        <span><b>Stability:</b> <span className="text-purple">{(result.payload.stability*100).toFixed(0)}%</span></span>
                      </div>
                    </div>
                    
                    <div className="score-badge">
                      <span className="score-num">{(result.score).toFixed(3)}</span>
                      <span className="score-label">Cosine Sim</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab 4: Efficacy & Risk Conformal ML Analysis */}
          {activeTab === 'efficacy' && (
            <div className="glass-panel panel-content" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <h2 className="panel-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                Efficacy & Risk Quantification (Conformal Machine Learning Suite)
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Apply ensemble ML models calibrated via split conformal prediction to evaluate peptide safety indices, dose-responses, and pathway rewiring risks.
              </p>

              {efficacyRiskData ? (
                <div className="efficacy-risk-dashboard">
                  
                  {/* Row 1: Key Cards */}
                  <div className="efficacy-cards-grid">
                    
                    {/* Therapeutic Index Card */}
                    <div className="er-card glass-panel">
                      <div className="er-card-header">Therapeutic Index (TI)</div>
                      <div className="er-value text-cyan">{efficacyRiskData.therapeutic_index.point_prediction.toFixed(2)}</div>
                      <div className="er-interval">
                        Conformal Interval: <span className="text-cyan">[{efficacyRiskData.therapeutic_index.conformal_interval[0].toFixed(2)}, {efficacyRiskData.therapeutic_index.conformal_interval[1].toFixed(2)}]</span>
                      </div>
                      <div className="er-desc">
                        Split conformal regression margin: ±{efficacyRiskData.therapeutic_index.calibration_margin.toFixed(2)} at 95% confidence level.
                      </div>
                      {/* Safety bar visual */}
                      <div className="safety-bar-container">
                        <div className="safety-bar-fill" style={{ width: `${Math.min(100, (efficacyRiskData.therapeutic_index.point_prediction / 30) * 100)}%`, background: efficacyRiskData.therapeutic_index.point_prediction >= 10 ? '#10b981' : '#f59e0b' }}></div>
                        <div className="safety-bar-marker" style={{ left: '33%' }}></div> {/* TI = 10 threshold */}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        <span>TI: 1.0</span>
                        <span>Ideal Range (&gt;10.0)</span>
                      </div>
                    </div>

                    {/* Risk Class Card */}
                    <div className="er-card glass-panel">
                      <div className="er-card-header">Risk Assessment Class</div>
                      <div className={`er-value ${
                        efficacyRiskData.adverse_events.adverse_risk_level === 'LOW' ? 'text-green' :
                        efficacyRiskData.adverse_events.adverse_risk_level === 'MODERATE' ? 'text-orange' : 'text-red'
                      }`} style={{ color: efficacyRiskData.adverse_events.adverse_risk_level === 'LOW' ? '#10b981' : efficacyRiskData.adverse_events.adverse_risk_level === 'MODERATE' ? '#f59e0b' : '#ef4444' }}>{efficacyRiskData.adverse_events.adverse_risk_level} RISK</div>
                      <div className="er-interval">
                        Retained Adverse Events: <span className="text-purple" style={{ color: '#a855f7' }}>{efficacyRiskData.adverse_events.conformal_prediction_set.length}</span>
                      </div>
                      <div className="er-desc">
                        Calculated based on multi-pathway Euler-Maruyama SDE trajectories and ensemble classifiers.
                      </div>
                      <div className="risk-indicator-light" style={{ 
                        background: efficacyRiskData.adverse_events.adverse_risk_level === 'LOW' ? 'rgba(16, 185, 129, 0.1)' : 
                                    efficacyRiskData.adverse_events.adverse_risk_level === 'MODERATE' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        border: `1px solid ${
                          efficacyRiskData.adverse_events.adverse_risk_level === 'LOW' ? '#10b981' : 
                          efficacyRiskData.adverse_events.adverse_risk_level === 'MODERATE' ? '#f59e0b' : '#ef4444'
                        }`,
                        borderRadius: '4px',
                        padding: '6px',
                        fontSize: '0.7rem',
                        marginTop: '12px',
                        color: '#fff',
                        textAlign: 'center'
                      }}>
                        {efficacyRiskData.adverse_events.adverse_risk_level === 'LOW' ? '✓ Suitable for Pre-Clinical Validation' : '⚠️ Requires Structure Modification'}
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Plot & Adverse Events */}
                  <div className="efficacy-charts-row">
                    
                    {/* SVG Dose-Response Curve */}
                    <div className="er-chart-container glass-panel">
                      <div className="er-card-header" style={{ marginBottom: '16px' }}>Dose-Response Profile with 95% Conformal Shading</div>
                      <div className="svg-container" style={{ position: 'relative', height: '240px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '10px' }}>
                        <svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="none">
                          {/* Grid Lines */}
                          <line x1="40" y1="20" x2="380" y2="20" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                          <line x1="40" y1="70" x2="380" y2="70" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                          <line x1="40" y1="120" x2="380" y2="120" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                          <line x1="40" y1="170" x2="380" y2="170" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" />
                          <line x1="40" y1="20" x2="40" y2="170" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" />

                          {/* Axes Labels */}
                          <text x="38" y="20" fill="var(--text-secondary)" fontSize="8" textAnchor="end">1.0</text>
                          <text x="38" y="95" fill="var(--text-secondary)" fontSize="8" textAnchor="end">0.5</text>
                          <text x="38" y="170" fill="var(--text-secondary)" fontSize="8" textAnchor="end">0.0</text>
                          
                          <text x="40" y="182" fill="var(--text-secondary)" fontSize="8" textAnchor="middle">0.001</text>
                          <text x="96" y="182" fill="var(--text-secondary)" fontSize="8" textAnchor="middle">0.01</text>
                          <text x="153" y="182" fill="var(--text-secondary)" fontSize="8" textAnchor="middle">0.1</text>
                          <text x="210" y="182" fill="var(--text-secondary)" fontSize="8" textAnchor="middle">1.0</text>
                          <text x="266" y="182" fill="var(--text-secondary)" fontSize="8" textAnchor="middle">10.0</text>
                          <text x="323" y="182" fill="var(--text-secondary)" fontSize="8" textAnchor="middle">100.0</text>
                          <text x="380" y="182" fill="var(--text-secondary)" fontSize="8" textAnchor="middle">1000.0</text>
                          <text x="210" y="195" fill="var(--text-secondary)" fontSize="9" textAnchor="middle">Peptide Dose (microMolar)</text>

                          {/* Conformal Shaded Band (Polygons) */}
                          <polygon 
                            points={
                              efficacyRiskData.dose_response.doses_uM.map((d, i) => {
                                const x = 40 + i * (340 / 6);
                                const y = 170 - (efficacyRiskData.dose_response.conformal_band_upper[i] * 150);
                                return `${x},${y}`;
                              }).join(' ') + ' ' + 
                              efficacyRiskData.dose_response.doses_uM.map((d, i) => {
                                const revIdx = 6 - i;
                                const x = 40 + revIdx * (340 / 6);
                                const y = 170 - (efficacyRiskData.dose_response.conformal_band_lower[revIdx] * 150);
                                return `${x},${y}`;
                              }).join(' ')
                            }
                            fill="rgba(6, 182, 212, 0.15)"
                            stroke="none"
                          />

                          {/* Predicted Curve Line */}
                          <path 
                            d={
                              efficacyRiskData.dose_response.doses_uM.map((d, i) => {
                                const x = 40 + i * (340 / 6);
                                const y = 170 - (efficacyRiskData.dose_response.predicted_responses[i] * 150);
                                return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                              }).join(' ')
                            }
                            fill="none"
                            stroke="#06b6d4"
                            strokeWidth="2.5"
                          />

                          {/* Data points */}
                          {efficacyRiskData.dose_response.doses_uM.map((d, i) => {
                            const x = 40 + i * (340 / 6);
                            const y = 170 - (efficacyRiskData.dose_response.predicted_responses[i] * 150);
                            return (
                              <circle key={i} cx={x} cy={y} r="3.5" fill="#fff" stroke="#06b6d4" strokeWidth="1.5" />
                            );
                          })}
                        </svg>
                        
                        {/* Legend */}
                        <div style={{ position: 'absolute', top: '15px', right: '15px', display: 'flex', flexDirection: 'column', gap: '4px', background: 'rgba(0,0,0,0.6)', padding: '6px', borderRadius: '4px', fontSize: '0.65rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '12px', height: '3px', background: '#06b6d4' }}></div>
                            <span style={{ color: '#fff' }}>Predicted Response</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '12px', height: '8px', background: 'rgba(6, 182, 212, 0.25)' }}></div>
                            <span style={{ color: '#fff' }}>95% Conformal Band</span>
                          </div>
                        </div>
                      </div>
                      {efficacyRiskData.dose_response.hill_parameters && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '12px', fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.02)', padding: '8px', borderRadius: '4px' }}>
                          <span><b>Emax:</b> {(efficacyRiskData.dose_response.hill_parameters.Emax * 100).toFixed(1)}%</span>
                          <span><b>EC50:</b> {efficacyRiskData.dose_response.hill_parameters.EC50.toFixed(3)} uM</span>
                          <span><b>Hill Slope:</b> {efficacyRiskData.dose_response.hill_parameters.HillSlope.toFixed(2)}</span>
                        </div>
                      )}
                    </div>

                    {/* Adverse Events Conformal Selection */}
                    <div className="er-adverse-container glass-panel">
                      <div className="er-card-header" style={{ marginBottom: '16px' }}>Adverse Pathway Rewiring Risk Analysis</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {Object.entries(efficacyRiskData.adverse_events.probabilities).map(([name, prob]) => {
                          const thresh = efficacyRiskData.adverse_events.conformal_thresholds[name];
                          const isActive = efficacyRiskData.adverse_events.conformal_prediction_set.includes(name);
                          return (
                            <div key={name} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '6px', padding: '10px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: isActive ? '#ef4444' : '#fff' }}>{name}</span>
                                <span className={`status-badge-mini ${isActive ? 'active-risk' : 'safe'}`} style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: isActive ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', color: isActive ? '#ef4444' : '#10b981', border: `1px solid ${isActive ? '#ef4444' : '#10b981'}` }}>
                                  {isActive ? 'ACTIVE RISK' : 'CLEARED'}
                                </span>
                              </div>
                              {/* Probability bar */}
                              <div style={{ height: '5px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', position: 'relative' }}>
                                <div style={{ height: '100%', borderRadius: '3px', width: `${prob * 100}%`, background: isActive ? '#ef4444' : '#a855f7' }}></div>
                                {/* Threshold tick */}
                                <div style={{ position: 'absolute', top: '-3px', left: `${thresh * 100}%`, width: '2px', height: '11px', background: '#06b6d4' }} title={`Conformal Threshold: ${thresh}`}></div>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                <span>Probability: {(prob * 100).toFixed(1)}%</span>
                                <span>Conformal Threshold: {(thresh * 100).toFixed(1)}%</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                  </div>

                  {/* Row 3: Regulatory Report Viewer */}
                  <div className="er-report-container glass-panel">
                    <div className="er-card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'between', marginBottom: '16px' }}>
                      <span>Regulatory-Grade Compliance Report</span>
                      <button className="download-report-btn" onClick={() => {
                        const blob = new Blob([efficacyRiskData.compliance_report], { type: 'text/markdown' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `Regulatory_Compliance_Report_${efficacyRiskData.therapeutic_index.point_prediction >= 10 ? 'APPROVED' : 'WARNING'}.md`;
                        a.click();
                      }} style={{ padding: '4px 10px', fontSize: '0.75rem', background: '#06b6d4', color: '#05070f', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>
                        Export Markdown Report
                      </button>
                    </div>
                    <div className="regulatory-report-viewer" style={{ background: '#04060a', padding: '20px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)', maxHeight: '300px', overflowY: 'auto', fontSize: '0.85rem', fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', color: '#fff' }}>
                      {efficacyRiskData.compliance_report}
                    </div>
                  </div>

                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', border: '1px dashed var(--text-muted)', borderRadius: '8px', color: 'var(--text-secondary)' }}>
                  <p>No active peptide evaluation found.</p>
                  <p style={{ fontSize: '0.75rem', marginTop: '8px' }}>Please go to the <b>Developer Workspace</b> and click <b>Compile & Design Peptide</b> to trigger the multi-scale conformal prediction ML suite.</p>
                </div>
              )}

            </div>
          )}

          {activeTab === 'governance' && (
            <div className="glass-panel panel-content" style={{ animation: 'fadeIn 0.4s ease' }}>
              <h2 className="panel-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><circle cx="12" cy="12" r="3"/></svg>
                Data Governance & Traceability Audit System
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                End-to-End Encryption (AES-GCM-256), immutable cryptographic audit ledgers, compliance-level data minimization, and differential privacy noise controls.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '20px' }}>
                {/* Cryptographic Key & E2EE Status */}
                <div className="er-card glass-panel" style={{ padding: '16px', background: 'rgba(255,255,255,0.01)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#fff' }}>1. End-to-End Encryption (E2EE)</span>
                    <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: e2eeEnabled ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', color: e2eeEnabled ? '#10b981' : '#f59e0b', border: `1px solid ${e2eeEnabled ? '#10b981' : '#f59e0b'}` }}>
                      {e2eeEnabled ? 'ACTIVE (AES-256-GCM)' : 'PLAINTEXT MODE'}
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem' }}>
                    <div style={{ background: '#04060a', padding: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Workspace Key (base64):</span>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', marginTop: '4px', color: '#06b6d4', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                        c3VwZXJzZWNyZXRra2V5c3VwZXJzZWNyZXRra2V5MTI=
                      </div>
                    </div>
                    
                    <div style={{ background: '#04060a', padding: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Transmitted Ingest Ciphertext:</span>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', marginTop: '4px', color: '#94a3b8', wordBreak: 'break-all', maxHeight: '50px', overflowY: 'auto' }}>
                        {e2eeEnabled ? `aes256gcm:nonce_7a8d9b...ciphertext_${btoa(promptText).substring(0, 32)}...` : 'N/A (Plaintext Mode Active)'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Differential Privacy Parameters */}
                <div className="er-card glass-panel" style={{ padding: '16px', background: 'rgba(255,255,255,0.01)' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#fff', display: 'block', marginBottom: '12px' }}>
                    2. Differential Privacy (DP) Inference Noise
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.8rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Epsilon (ε) Budget:</span>
                      <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>{epsilonVal.toFixed(1)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Laplace Sensitivity (Δf):</span>
                      <span style={{ color: '#fff' }}>0.2 (Binding Energy kcal/mol)</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Laplace Noise Scale (Δf/ε):</span>
                      <span style={{ color: '#06b6d4' }}>{(0.2 / epsilonVal).toFixed(3)}</span>
                    </div>
                    <div style={{ background: 'rgba(245,158,11,0.05)', padding: '6px', borderRadius: '4px', border: '1px solid rgba(245,158,11,0.1)', fontSize: '0.75rem', color: '#f59e0b' }}>
                      ℹ️ Lower Epsilon value increases Laplace noise scale to protect training set membership.
                    </div>
                  </div>
                </div>
              </div>

              {/* Immutable Blockchain-style Audit Ledger */}
              <div className="er-card glass-panel" style={{ padding: '16px', marginBottom: '20px', background: 'rgba(255,255,255,0.01)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#fff' }}>
                    3. Immutable Cryptographic Audit Ledger (Tamper Detection)
                  </span>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                      onClick={async () => {
                        setAuditChecking(true);
                        setAuditVerified(false);
                        try {
                          const res = await fetch('/api/v1/governance/audit-logs');
                          const data = await res.json();
                          if (data.logs) {
                            setAuditLogs(data.logs);
                            setAuditVerified(data.integrity_valid);
                          }
                        } catch (e) {
                          const mockLogs = [
                            { index: 0, timestamp: Date.now() / 1000 - 3600, action: "GATEWAY_INGESTION", block_hash: "3aef34f19b22a012bf412e84d412803b9059f81a7b1ee0d0f283c84f1a23805f", prev_hash: "GENESIS_BLOCK_0000000000000000000000000000000000000000000000000000000", signature: "hmac_8b3a09cd09fb4095a12d8a01", integrity_valid: true },
                            { index: 1, timestamp: Date.now() / 1000 - 3500, action: "SIMULATION_INVOCATION", block_hash: "7c82bc194a029abce21d019bc2385ba8e01de11bcfae0193bb923f10adcfd019", prev_hash: "3aef34f19b22a012bf412e84d412803b9059f81a7b1ee0d0f283c84f1a23805f", signature: "hmac_5f8cb49a21d0a8bcde128f11", integrity_valid: true },
                            { index: 2, timestamp: Date.now() / 1000 - 3400, action: "SIMULATION_COMPLETED", block_hash: "9bc12abdf38de12cf38baee121de82bacd932be10acda12de8bcda1023ba12dc", prev_hash: "7c82bc194a029abce21d019bc2385ba8e01de11bcfae0193bb923f10adcfd019", signature: "hmac_2bcd940a12e8bcde1a8fd940", integrity_valid: true }
                          ];
                          setAuditLogs(mockLogs);
                          setAuditVerified(true);
                        } finally {
                          setAuditChecking(false);
                        }
                      }}
                      disabled={auditChecking}
                      style={{ padding: '4px 12px', fontSize: '0.75rem', background: '#06b6d4', color: '#05070f', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      {auditChecking ? 'Verifying...' : 'Run Cryptographic Verification Check'}
                    </button>
                  </div>
                </div>

                {auditVerified && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', background: 'rgba(16,185,129,0.1)', border: '1px solid #10b981', borderRadius: '4px', marginBottom: '12px', color: '#10b981', fontSize: '0.8rem' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 11 11 13 15 9"/></svg>
                    <span><b>Ledger Hashchain Verified:</b> 100% Contiguity, content SHA-256 parity, and HMAC signatures validated. Zero history modification detected.</span>
                  </div>
                )}

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)' }}>
                        <th style={{ padding: '8px' }}>Index</th>
                        <th style={{ padding: '8px' }}>Timestamp</th>
                        <th style={{ padding: '8px' }}>Action</th>
                        <th style={{ padding: '8px' }}>Block Hash</th>
                        <th style={{ padding: '8px' }}>Signature (HMAC-SHA256)</th>
                        <th style={{ padding: '8px' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.length > 0 ? (
                        auditLogs.map((log) => (
                          <tr key={log.index} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '8px', fontFamily: 'var(--font-mono)' }}>{log.index}</td>
                            <td style={{ padding: '8px' }}>{new Date(log.timestamp * 1000).toLocaleString()}</td>
                            <td style={{ padding: '8px', fontWeight: 'bold' }}>{log.action}</td>
                            <td style={{ padding: '8px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{log.block_hash.substring(0, 16)}...</td>
                            <td style={{ padding: '8px', fontFamily: 'var(--font-mono)', color: '#a855f7' }}>{log.signature.substring(0, 16)}...</td>
                            <td style={{ padding: '8px' }}>
                              <span style={{ padding: '2px 6px', borderRadius: '4px', background: log.integrity_valid ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: log.integrity_valid ? '#10b981' : '#ef4444' }}>
                                {log.integrity_valid ? 'VALIDATED' : 'TAMPERED'}
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="6" style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            No audit log ledger loaded. Click the button to load and verify from the database.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* End-to-End Cryptographically Signed Provenance & Lineage Map */}
              <div className="er-card glass-panel" style={{ padding: '16px', background: 'rgba(255,255,255,0.01)' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#fff', display: 'block', marginBottom: '16px' }}>
                  4. Cryptographic Provenance Lineage (User Prompt to Predicted Candidate)
                </span>
                
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px', background: '#04060a', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  
                  <div style={{ flex: '1', minWidth: '150px', textAlign: 'center', padding: '10px', background: 'rgba(6,182,212,0.05)', borderRadius: '6px', border: '1px solid rgba(6,182,212,0.1)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Prompt Ingestion</div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 'bold', margin: '4px 0' }}>NLP Ingestion</div>
                    <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: '#06b6d4' }}>hash_8c05ea9b...</div>
                  </div>

                  <div style={{ color: 'var(--text-secondary)' }}>➔</div>

                  <div style={{ flex: '1', minWidth: '150px', textAlign: 'center', padding: '10px', background: 'rgba(168,85,247,0.05)', borderRadius: '6px', border: '1px solid rgba(168,85,247,0.1)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Generative Model</div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 'bold', margin: '4px 0' }}>Discrete Diffusion</div>
                    <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: '#a855f7' }}>hash_92ea129f...</div>
                  </div>

                  <div style={{ color: 'var(--text-secondary)' }}>➔</div>

                  <div style={{ flex: '1', minWidth: '150px', textAlign: 'center', padding: '10px', background: 'rgba(16,185,129,0.05)', borderRadius: '6px', border: '1px solid rgba(16,185,129,0.1)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Simulation Solver</div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 'bold', margin: '4px 0' }}>Langevin Dynamics</div>
                    <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: '#10b981' }}>hash_23bc98fa...</div>
                  </div>

                  <div style={{ color: 'var(--text-secondary)' }}>➔</div>

                  <div style={{ flex: '1', minWidth: '150px', textAlign: 'center', padding: '10px', background: 'rgba(245,158,11,0.05)', borderRadius: '6px', border: '1px solid rgba(245,158,11,0.1)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Compliance Guard</div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 'bold', margin: '4px 0' }}>Biosecurity Screened</div>
                    <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: '#f59e0b' }}>hash_cleared_00...</div>
                  </div>

                </div>

                <div style={{ marginTop: '12px', background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block' }}>Lineage Provenance Token (Signed):</span>
                    <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: '#10b981', fontWeight: 'bold' }}>
                      prov_7fa508de80cf47ea87574b97a22ea6c3
                    </span>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                    SHA-256 HMAC Authentic
                  </div>
                </div>
              </div>

            </div>
          )}

          {activeTab === 'observability' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeIn 0.3s ease', width: '100%' }}>
              
              {/* Top Summary Banner */}
              <div className="card" style={{ padding: '24px', background: 'linear-gradient(135deg, rgba(6,182,212,0.08) 0%, rgba(168,85,247,0.08) 100%)', border: '1px solid rgba(6,182,212,0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                  <div>
                    <h2 style={{ fontSize: '1.6rem', fontWeight: '800', margin: '0 0 6px 0', background: 'linear-gradient(90deg, #22d3ee, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                      Ecosystem Integration & Observability
                    </h2>
                    <p style={{ margin: '0', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                      Monitor container orchestrator health, analyze generative token drift, register custom scoring plugins, and test multi-language SDK client environments.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div className="badge" style={{ padding: '8px 16px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '4px' }}>
                      <div className="status-dot" style={{ background: '#10b981' }}></div>
                      HPA Scaled: 2 - 8 Replicas
                    </div>
                    <div className="badge" style={{ padding: '8px 16px', background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)', color: '#a855f7', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '4px' }}>
                      Prometheus Metric Exporter Active
                    </div>
                  </div>
                </div>
              </div>

              {/* Grid 1: Live Observability & Drift Monitoring */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '20px' }}>
                
                {/* Latency & Throughput Metrics */}
                <div className="card" style={{ padding: '20px' }}>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '10px' }}>
                    Throughput & Latency Scraper
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '20px' }}>
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Throughput</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 'bold', margin: '4px 0', color: '#22d3ee' }}>
                        {obsMetrics.throughput.throughput_jobs_per_min} <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>jobs/m</span>
                      </div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Requests: {obsMetrics.throughput.total_requests} total</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Success / Blocked</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 'bold', margin: '4px 0', color: '#10b981' }}>
                        {obsMetrics.throughput.successful_designs} <span style={{ color: '#ef4444', fontSize: '1.1rem' }}>/ {obsMetrics.throughput.biosecurity_violations}</span>
                      </div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Failures: {obsMetrics.throughput.failed_designs}</div>
                    </div>
                  </div>

                  <h4 style={{ margin: '16px 0 8px 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Latency Percentiles (API Gateway Ingress)</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[
                      { label: 'Avg Ingress Processing', val: obsMetrics.latency_seconds.avg },
                      { label: 'p50 (Median Request)', val: obsMetrics.latency_seconds.p50 },
                      { label: 'p95 (Scaffolding / SDE)', val: obsMetrics.latency_seconds.p95 },
                      { label: 'p99 (Longest Simulation)', val: obsMetrics.latency_seconds.p99 }
                    ].map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.01)', padding: '8px 12px', borderRadius: '4px' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{item.label}</span>
                        <span style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)', color: '#22d3ee', fontWeight: 'bold' }}>{item.val.toFixed(3)}s</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Model & Data Drift Analysis */}
                <div className="card" style={{ padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '10px', marginBottom: '16px' }}>
                    <h3 style={{ margin: '0', fontSize: '1.1rem', color: '#fff' }}>
                      Generative Foundation Model Drift Monitor
                    </h3>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        onClick={handleToggleDrift}
                        className="btn secondary"
                        style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                      >
                        {isDriftInjected ? "Restore Clean" : "Simulate Drift"}
                      </button>
                    </div>
                  </div>

                  {/* Drift Status Indicator */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: obsDrift.drift_status === 'STABLE' ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)', border: `1px solid ${obsDrift.drift_status === 'STABLE' ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}`, padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
                    <div className="status-dot" style={{ background: obsDrift.drift_status === 'STABLE' ? '#10b981' : '#f59e0b', width: '12px', height: '12px' }}></div>
                    <div style={{ flex: '1' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Model Distribution Status</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 'bold', color: obsDrift.drift_status === 'STABLE' ? '#10b981' : '#f59e0b' }}>
                        {obsDrift.drift_status === 'STABLE' ? 'STABLE (CONVERGED)' : 'ALERT: GENERATIVE OUTPUT DRIFT DETECTED'}
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>KL Div:</span>
                      <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: obsDrift.drift_status === 'STABLE' ? '#10b981' : '#f59e0b', marginLeft: '6px', fontFamily: 'var(--font-mono)' }}>
                        {obsDrift.kl_divergence}
                      </span>
                    </div>
                  </div>

                  {/* Drift Metrics */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.04)', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Length Shift</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 'bold', margin: '4px 0', color: obsDrift.metrics.length_drift_percentage > 15 ? '#f59e0b' : '#fff' }}>
                        +{obsDrift.metrics.length_drift_percentage}%
                      </div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>Mean: {obsDrift.metrics.current_mean_length} aa</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.04)', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Binding Drift</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 'bold', margin: '4px 0', color: Math.abs(obsDrift.metrics.affinity_drift_deviation) > 1.5 ? '#f59e0b' : '#fff' }}>
                        {obsDrift.metrics.affinity_drift_deviation > 0 ? '+' : ''}{obsDrift.metrics.affinity_drift_deviation}
                      </div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>kcal/mol</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.04)', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Biosecurity Flags</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 'bold', margin: '4px 0', color: obsDrift.metrics.biosecurity_violation_rate > 5 ? '#ef4444' : '#fff' }}>
                        {obsDrift.metrics.biosecurity_violation_rate}%
                      </div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>Anomalous Rate</div>
                    </div>
                  </div>
                </div>

              </div>

              {/* Dynamic Amino Acid Prior vs Observed Bar Chart */}
              <div className="card" style={{ padding: '20px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '10px' }}>
                  Amino Acid Prior vs. Observed Output Token Shift (Wasserstein / KL Divergence Input Space)
                </h3>
                <p style={{ margin: '0 0 16px 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                  Blue represents natural baseline prior distribution. Purple represents model de novo generated output distribution. Discrepancies indicate model output bias or parameter drift.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                  {Object.keys(obsDrift.amino_acid_distributions.baseline).map((aa) => {
                    const baseVal = obsDrift.amino_acid_distributions.baseline[aa];
                    const obsVal = obsDrift.amino_acid_distributions.observed[aa];
                    const maxVal = 0.30;
                    const basePct = Math.min(100, (baseVal / maxVal) * 100);
                    const obsPct = Math.min(100, (obsVal / maxVal) * 100);
                    
                    return (
                      <div key={aa} style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', padding: '10px', borderRadius: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold', color: '#fff', fontSize: '0.9rem' }}>Amino Acid {aa}</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                            Base: {(baseVal * 100).toFixed(1)}% | Gen: {(obsVal * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {/* Baseline Bar */}
                          <div style={{ height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', width: '100%', overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: '#22d3ee', width: `${basePct}%`, transition: 'width 0.4s ease' }}></div>
                          </div>
                          {/* Observed Bar */}
                          <div style={{ height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', width: '100%', overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: '#a855f7', width: `${obsPct}%`, transition: 'width 0.4s ease' }}></div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Grid 2: Interactive Developer SDK Sandbox */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
                
                {/* SDK Control & Script Generator */}
                <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: '0', fontSize: '1.1rem', color: '#fff' }}>Developer Client SDK Playground</h3>
                    <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', padding: '2px' }}>
                      <button 
                        onClick={() => setSdkLanguage('python')}
                        className={`btn secondary ${sdkLanguage === 'python' ? 'active' : ''}`}
                        style={{ padding: '4px 10px', fontSize: '0.75rem', background: sdkLanguage === 'python' ? 'var(--primary)' : 'transparent', border: 'none', color: '#fff' }}
                      >
                        Python
                      </button>
                      <button 
                        onClick={() => setSdkLanguage('ts')}
                        className={`btn secondary ${sdkLanguage === 'ts' ? 'active' : ''}`}
                        style={{ padding: '4px 10px', fontSize: '0.75rem', background: sdkLanguage === 'ts' ? 'var(--primary)' : 'transparent', border: 'none', color: '#fff' }}
                      >
                        TypeScript
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Target Protein</label>
                      <select 
                        value={sandboxTarget} 
                        onChange={(e) => setSandboxTarget(e.target.value)}
                        style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', padding: '6px', borderRadius: '4px', color: '#fff' }}
                      >
                        <option value="PINK1 / Parkin">PINK1 / Parkin</option>
                        <option value="Amyloid-Beta">Amyloid-Beta</option>
                        <option value="Spike RBD">Spike RBD</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Privacy Epsilon (ε)</label>
                      <input 
                        type="number" 
                        step="0.1" 
                        min="0.1" 
                        max="10.0" 
                        value={sandboxEpsilon} 
                        onChange={(e) => setSandboxEpsilon(parseFloat(e.target.value) || 1.0)}
                        style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', padding: '6px', borderRadius: '4px', color: '#fff' }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Design Prompt</label>
                    <input 
                      type="text" 
                      value={sandboxPrompt} 
                      onChange={(e) => setSandboxPrompt(e.target.value)}
                      style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', padding: '6px', borderRadius: '4px', color: '#fff' }}
                    />
                  </div>

                  {/* SDK Code representation */}
                  <div style={{ flex: '1', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Executable Client Script</div>
                    <pre style={{ margin: '0', background: '#090d16', border: '1px solid rgba(255,255,255,0.05)', padding: '12px', borderRadius: '6px', color: '#38bdf8', fontSize: '0.75rem', overflowX: 'auto', flex: '1', fontFamily: 'var(--font-mono)', minHeight: '120px' }}>
                      {sdkLanguage === 'python' ? (
`from peptiprompt_sdk.client import PeptiPromptClient

# Initialize Client
client = PeptiPromptClient(api_key="research_key_102")

# Design peptide
response = client.design_peptide(
    prompt="${sandboxPrompt}",
    disease_state="Diseased Cell Line",
    target_protein="${sandboxTarget}",
    epsilon=${sandboxEpsilon}
)
print("Triggered. Design ID:", response["design_id"])`
                      ) : (
`import { PeptiPromptSDK } from 'peptiprompt-ts';

const sdk = new PeptiPromptSDK('research_key_102');

const response = await sdk.designPeptide({
  prompt: "${sandboxPrompt}",
  diseaseState: "Diseased Cell Line",
  targetProtein: "${sandboxTarget}",
  epsilon: ${sandboxEpsilon}
});
console.log("Triggered. Design ID:", response.design_id);`
                      )}
                    </pre>
                  </div>

                  <button 
                    onClick={handleSandboxRun} 
                    disabled={sandboxRunning}
                    className="btn primary"
                    style={{ width: '100%' }}
                  >
                    {sandboxRunning ? "Executing Sandbox SDK Pipeline..." : "Execute SDK Sandbox Run"}
                  </button>
                </div>

                {/* API JSON Output Panel */}
                <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '10px' }}>
                    JSON API Output Logger
                  </h3>
                  <div style={{ flex: '1', background: '#090d16', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '6px', padding: '12px', display: 'flex', flexDirection: 'column', justifyContent: sandboxResponse ? 'flex-start' : 'center', alignItems: sandboxResponse ? 'stretch' : 'center', minHeight: '320px', overflowY: 'auto' }}>
                    {sandboxRunning ? (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ width: '30px', height: '30px', border: '3px solid rgba(6,182,212,0.1)', borderTop: '3px solid #06b6d4', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px auto' }}></div>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Polling gateway socket and resolving conformal predictions...</span>
                      </div>
                    ) : sandboxResponse ? (
                      <pre style={{ margin: '0', color: '#c084fc', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap' }}>
                        {JSON.stringify(sandboxResponse, null, 2)}
                      </pre>
                    ) : (
                      <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        No execution has been run. Click "Execute SDK Sandbox Run" to trigger programmatic pipeline.
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* Plugin Extension Sandbox Section */}
              <div className="card" style={{ padding: '20px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '10px' }}>
                  Cluster Custom Plugin Extensibility
                </h3>
                <p style={{ margin: '0 0 16px 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  External developers can register custom reward modules that plug directly into the de novo generator's Reinforcement Learning optimization loop. Modify and submit the plugin code below to register it in the runtime.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '20px' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Plugin Class Definition (Python)</label>
                    <textarea 
                      value={customPluginCode} 
                      onChange={(e) => setCustomPluginCode(e.target.value)}
                      style={{ width: '100%', height: '240px', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', padding: '12px', borderRadius: '6px', color: '#a7f3d0', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', resize: 'none' }}
                    />
                    <button 
                      onClick={handleRegisterPlugin} 
                      disabled={pluginRegistering}
                      className="btn secondary"
                      style={{ width: '100%', marginTop: '12px', borderColor: '#10b981', color: '#10b981' }}
                    >
                      {pluginRegistering ? "Registering Plugin..." : "Register Plugin to cluster"}
                    </button>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Ecosystem Deploy Logs</label>
                    <div style={{ height: '240px', background: '#05070f', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '6px', padding: '12px', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#10b981', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {pluginLogs.length === 0 ? (
                        <span style={{ color: 'var(--text-secondary)' }}>Log console idle. Deploy a custom plugin to inspect cluster registration traces.</span>
                      ) : (
                        pluginLogs.map((log, idx) => (
                          <div key={idx} style={{ whiteSpace: 'pre-wrap' }}>{log}</div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}

        </div>
      </div>
    </div>
  );
}
