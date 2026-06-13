# PeptiPrompt API Platform & Developer Portal

This repository contains the core microservices, container files, Kubernetes deployment manifests, and interactive developer portal ("no-code builder interface") for the **PeptiPrompt API Platform**.

## 1. Microservices Architecture

PeptiPrompt is designed as a distributed, decoupled, and highly elastic system. It consists of the following components:

*   **API Gateway (`services/gateway/`)**: A FastAPI entrypoint that exposes public REST endpoints, rate-limits requests, handles user authentication/usage metering, and orchestrates live physical telemetry streams via WebSockets.
*   **Generative Diffusion Service (`services/diffusion/`)**: An asynchronous worker that consumes de novo design jobs from Apache Kafka. It runs iterative denoising diffusion models (modeled on LigandForge structures) to output optimized peptide sequences.
*   **Digital Twin Simulation Service (`services/simulation/`)**: A computational physics worker that consumes sequences, simulates molecular dynamics energy minimization (using Langevin solvers), models cell-level signal cascades (using SDE solvers), and logs results to PostgreSQL.
*   **Pathway Graph Service (`services/pathway/`)**: A graph database interface querying signaling cascades and protein-protein relationships from Neo4j.
*   **Vector Search Service (`services/vector_search/`)**: An index-and-query service mapping high-dimensional disease state descriptions to historical peptide designs using Qdrant.

## 2. Directory Structure

```text
peptideOS/
├── k8s/
│   ├── databases-deployments.yaml  # PostgreSQL, Neo4j, Qdrant, and Kafka
│   ├── services-deployments.yaml   # Gateway, Diffusion, Simulation, Pathway, and Vector Search
│   ├── istio-mesh-security.yaml    # Istio PeerAuthentication, VirtualServices, DestinationRules
│   └── hpa.yaml                    # Horizontal Pod Autoscalers (elastic scaling)
├── services/
│   ├── gateway/                    # Gateway app code, requirements, and Dockerfile
│   ├── diffusion/                  # Diffusion worker code, requirements, and Dockerfile
│   ├── simulation/                 # Simulation worker code, requirements, and Dockerfile
│   ├── pathway/                    # Pathway database interface app code and Dockerfile
│   └── vector_search/              # Vector similarity index app code and Dockerfile
├── src/                            # React Developer Portal (No-code builder UI)
│   ├── App.jsx                     # Dashboard workspace, Canvas Langevin simulation, Vector search
│   ├── App.css                     # Glassmorphic layout, SVG path flow-lines, custom themes
│   └── index.css                   # Global styles & layout resets
├── docker-compose.yml              # Local orchestration configuration
├── package.json
└── vite.config.js
```

## 3. Running Locally with Docker Compose

To spin up the entire distributed backend environment (including databases, message brokers, and all microservices) locally:

```bash
# Build and run all containers
docker-compose up --build
```

The services will bind to the following local ports:
*   **API Gateway**: `http://localhost:8000`
*   **Pathway Service**: `http://localhost:8002`
*   **Vector Search Service**: `http://localhost:8003`
*   **PostgreSQL**: `localhost:5432`
*   **Kafka Broker**: `localhost:29092`

## 4. Deploying to Kubernetes (Hybrid Cloud Infrastructure)

The platform is orchestrated in Kubernetes with an **Istio Service Mesh** injected for secure communication and fault tolerance.

### Step 1: Initialize Database & Messaging Clusters
```bash
kubectl apply -f k8s/databases-deployments.yaml
```

### Step 2: Deploy Core Microservices
```bash
kubectl apply -f k8s/services-deployments.yaml
```

### Step 3: Configure Service Mesh, mTLS, & Circuit Breakers
Apply strict mutual TLS and outlier detection rules (circuit breakers) for the internal pathway and vector search services:
```bash
kubectl apply -f k8s/istio-mesh-security.yaml
```

### Step 4: Configure Elastic Autoscaling (HPA)
Deploy Horizontal Pod Autoscaling limits to scale services up to 10 replicas under peak enterprise simulation loads:
```bash
kubectl apply -f k8s/hpa.yaml
```

## 5. Running the No-Code Developer Portal

The React developer portal runs locally with Vite, showing a real-time visualization of the microservices topology, Kafka queues, Langevin molecular simulations, and pathway graphs.

To run:
```bash
# Install dependencies
npm install

# Start the local development server
npm run dev
```
Navigate to `http://localhost:5173` in your browser.
