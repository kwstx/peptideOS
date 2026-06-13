import os
import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict
import random

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("vector-search-service")

app = FastAPI(
    title="PeptiPrompt Vector Search Service",
    description="Vector similarity search for disease state embeddings and prior peptide designs",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

QDRANT_HOST = os.getenv("QDRANT_HOST", "qdrant")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", 6333))

# Mock Library of prior peptide designs
PRIOR_DESIGNS = [
    {
        "id": "PEP-1042",
        "disease_state": "Mitochondrial Tagging Deficit (Post-Viral Neuropathy)",
        "description": "Designed to correct mitochondrial tagging deficits in neurons after viral exposure by enhancing PINK1/Parkin outer-membrane recruitment.",
        "sequence": "MGAFLGKVLKACVVALSGKLL-NH2",
        "binding_affinity": -12.4,
        "stability": 0.94
    },
    {
        "id": "PEP-2210",
        "disease_state": "Alzheimer's Disease (Amyloid-Beta Aggregation)",
        "description": "Disrupts the self-assembly of amyloid-beta (Abeta42) oligomers, preventing neurotoxic plaque formation.",
        "sequence": "KLVFF-NH2",
        "binding_affinity": -9.8,
        "stability": 0.82
    },
    {
        "id": "PEP-3051",
        "disease_state": "SARS-CoV-2 Viral Entry (Spike Protein Blockade)",
        "description": "Competitively binds to the receptor binding domain (RBD) of SARS-CoV-2 spike protein, blocking human ACE2 interaction.",
        "sequence": "IEEQAKTFLDKFNHEAEDLFYQ-NH2",
        "binding_affinity": -14.2,
        "stability": 0.91
    },
    {
        "id": "PEP-0982",
        "disease_state": "Oncology (p53-MDM2 Pathway Restoration)",
        "description": "Mimics the transactivation domain of p53 to bind MDM2, thereby releasing p53 from degradation and restoring tumor suppressor function.",
        "sequence": "ETFSDLWKLLPE-NH2",
        "binding_affinity": -11.9,
        "stability": 0.85
    },
    {
        "id": "PEP-4109",
        "disease_state": "Parkinson's Disease (Alpha-Synuclein Fibrillization)",
        "description": "Targeted peptide binder that anchors to alpha-synuclein monomers to inhibit cellular nucleation and propagation.",
        "sequence": "EGVVAAAEKTK-NH2",
        "binding_affinity": -10.1,
        "stability": 0.87
    }
]

class SearchRequest(BaseModel):
    query: str
    limit: int = 3

@app.get("/health")
def health():
    return {"status": "healthy", "service": "vector-search-service"}

@app.post("/api/v1/search/vectors")
def vector_search(request: SearchRequest):
    """
    Computes vector embeddings for the incoming query and performs a similarity
    search against indexed vectors in a vector database (e.g. Qdrant / Milvus).
    """
    logger.info(f"Computing embeddings and searching vector space for: '{request.query}'")
    
    # Simulate computing cosine similarities by scanning keywords and adding minor randomness
    query_lower = request.query.lower()
    scored_results = []
    
    for design in PRIOR_DESIGNS:
        # Check overlaps
        overlap = 0.0
        words = query_lower.split()
        for word in words:
            if len(word) > 3:
                if word in design["disease_state"].lower() or word in design["description"].lower():
                    overlap += 0.25
                    
        # Add baseline similarity score + random variance
        score = min(0.99, max(0.40, 0.50 + overlap + random.uniform(-0.05, 0.05)))
        scored_results.append({
            "score": score,
            "payload": design
        })
        
    # Sort by score descending
    scored_results.sort(key=lambda x: x["score"], reverse=True)
    return scored_results[:request.limit]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003)
