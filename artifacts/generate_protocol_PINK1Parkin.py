import requests
import json

# Auto-generated PeptiPrompt API Script
# Target: PINK1 / Parkin

API_ENDPOINT = "https://api.peptideos.com/v1/design"
API_KEY = "your_api_key_here"

payload = {
    "prompt": "Developing a targeted mitochondrial Tagging ligand to rescue post-viral neural mitophagy deficits",
    "target": "PINK1 / Parkin",
    "scale": "high_fidelity",
    "constraints": {
        "max_length": 32,
        "off_target_tolerance": 0.12
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
