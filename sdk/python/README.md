# PeptiPrompt Python SDK

A high-performance Python software development kit (SDK) to programmatically interface with the PeptiPrompt Biology-as-Code platform. 

Enable de novo design pipelines, stream real-time physics telemetry, integrate custom plugins, and fetch regulatory compliance safety certificates directly from your python scripts.

## Installation

```bash
pip install requests websocket-client
```

## Basic Usage

### 1. Initializing the Client

```python
from peptiprompt_sdk.client import PeptiPromptClient

# Initialize client using your researcher API key
client = PeptiPromptClient(
    api_key="your_researcher_api_key_here",
    base_url="http://localhost:8000"
)
```

### 2. Triggering de novo Peptide Design

```python
# Launch asynchronous generative diffusion & Langevin simulation pipeline
response = client.design_peptide(
    prompt="Enhance Parkin recruitment on damaged mitochondria outer membrane",
    disease_state="Mitochondrial Tagging Deficit",
    target_protein="PINK1 / Parkin",
    simulation_complexity="high_fidelity",
    is_encrypted=False,
    epsilon=1.5
)

design_id = response["design_id"]
print(f"Design job created: {design_id}")
```

### 3. Streaming Real-Time Telemetry over WebSockets

```python
def print_telemetry_metrics(data):
    stage = data.get("stage")
    progress = data.get("progress")
    msg = data.get("message")
    metrics = data.get("data", {})
    
    print(f"[{stage}] Progress: {progress}% - {msg}")
    if metrics:
        print(f"   Metrics -> {metrics}")

# Connect to WebSocket endpoint and stream live calculations
client.stream_telemetry(design_id, callback=print_telemetry_metrics)
```

### 4. Fetching Design Results & Conformal Safety Bounds

```python
details = client.get_design_details(design_id)
print(f"Designed Sequence: {details['sequence']}")
print(f"Therapeutic Index Conformal Interval: {details['ti_lower']} to {details['ti_upper']}")
print(f"Biosecurity Screening Status: {details['biosecurity_status']}")
```

### 5. Downloading Regulatory Compliance Reports

```python
client.download_compliance_report(design_id, output_path="./PEP-1042_Report.md")
```
