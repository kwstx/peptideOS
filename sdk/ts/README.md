# PeptiPrompt TypeScript SDK

TypeScript and JavaScript client bindings for the PeptiPrompt / peptideOS Biology-as-Code platform. Compatible with modern browsers, Node.js, and Bun/Deno environments.

## Installation

```bash
npm install isomorphic-ws ws
```

## Quick Start

### 1. Initialize Client

```typescript
import { PeptiPromptSDK } from './src/index';

const sdk = new PeptiPromptSDK(
  'your_api_key_here',
  'http://localhost:8000'
);
```

### 2. Request Peptide Design

```typescript
const request = {
  prompt: "Correcting mitochondrial tagging deficits in neurons",
  diseaseState: "Mitochondrial Tagging Deficit",
  targetProtein: "PINK1 / Parkin",
  simulationComplexity: "high_fidelity" as const,
  isEncrypted: false,
  epsilon: 1.0
};

const res = await sdk.designPeptide(request);
console.log(`Pipeline Triggered. Design ID: ${res.design_id}`);
```

### 3. Stream Telemetry over WebSocket

```typescript
const ws = sdk.streamTelemetry(res.design_id, 
  (data) => {
    console.log(`Stage: ${data.stage} (${data.progress}%)`);
    console.log(`Message: ${data.message}`);
    console.log("Telemetry Payload:", data.data);
  },
  (error) => {
    console.error("Websocket Error:", error);
  }
);
```
