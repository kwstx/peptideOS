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

        </div>
      </div>
    </div>
  );
}
