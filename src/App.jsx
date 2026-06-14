import React, { useState, useEffect, useRef } from 'react';
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
  const [promptText, setPromptText] = useState('Correcting mitochondrial tagging deficits in neurons after viral exposure');
  const [targetProtein, setTargetProtein] = useState('PINK1 / Parkin');
  const [complexity, setComplexity] = useState('standard');
  
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
  const [bindingAffinity, setBindingAffinity] = useState(0);
  const [stabilityScore, setStabilityScore] = useState(0);
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
    setPipelineStage('DIFFUSION');
    setPipelineProgress(15);
    noiseLevel.current = 1.0;
    addLog('gateway', `Accepted POST request for peptide design: "${promptText}"`);
    addLog('gateway', `Authenticating developer key and checking usage limits...`);
    
    // Step 1: Diffusion Stage
    await new Promise(r => setTimeout(r, 1500));
    addLog('kafka', `Job enqueued successfully to topic 'peptide-design-jobs'. Partition: 0, Offset: 242`);
    setPipelineStage('KAFKA');
    setPipelineProgress(35);
    setKafkaQueue(1);

    await new Promise(r => setTimeout(r, 1200));
    addLog('diffusion', `Diffusion worker picked up job. Initiating 50 de-scaffolding denoising steps...`);
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
    }

    const mockSequence = "MGAFLGKVLKACVVALSGKLL-NH2";
    setDesignedSequence(mockSequence);
    addLog('diffusion', `De novo sequence generation complete: ${mockSequence}`);
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

    const finalAffinity = -12.4;
    const finalStability = 0.94;
    setBindingAffinity(finalAffinity);
    setStabilityScore(finalStability);
    
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

  // Vector Search implementation
  const handleVectorSearch = () => {
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

                <button 
                  className="design-btn" 
                  onClick={triggerPipeline}
                  disabled={isDesigning || !promptText}
                >
                  {isDesigning ? 'Processing...' : 'Compile & Design Peptide'}
                </button>
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

        </div>
      </div>
    </div>
  );
}
