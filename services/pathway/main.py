import os
import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("pathway-service")

app = FastAPI(
    title="PeptiPrompt Pathway Service",
    description="Graph interface service for querying cellular signaling pathways and protein-protein interactions",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Neo4j environment variable placeholder
NEO4J_URI = os.getenv("NEO4J_URI", "bolt://neo4j:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASS = os.getenv("NEO4J_PASSWORD", "admin1234")

# Mock biological pathways database mapping diseases to nodes and relationships
BIOLOGICAL_PATHWAYS = {
    "mitochondrial_tagging": {
        "nodes": [
            {"id": "PINK1", "label": "Protein Kinase", "description": "Accumulates on outer mitochondrial membrane of damaged mitochondria."},
            {"id": "Parkin", "label": "E3 Ubiquitin Ligase", "description": "Recruited and activated by phosphorylated ubiquitin to tag outer membrane proteins."},
            {"id": "Mfn2", "label": "GTPase", "description": "Mitofusin-2; phosphorylated by PINK1, promoting Parkin binding."},
            {"id": "VDAC1", "label": "Ion Channel", "description": "Voltage-dependent anion channel; ubiquitinated by Parkin to recruit autophagy receptors."},
            {"id": "OPTN", "label": "Autophagy Receptor", "description": "Optineurin; binds ubiquitinated cargo and links them to LC3-II on phagophores."},
            {"id": "LC3-II", "label": "Autophagosome Marker", "description": "Mediates final phagophore closure and lysosome fusing."}
        ],
        "edges": [
            {"source": "PINK1", "target": "Mfn2", "type": "Phosphorylates", "effect": "activation"},
            {"source": "Mfn2", "target": "Parkin", "type": "Recruits", "effect": "activation"},
            {"source": "PINK1", "target": "Parkin", "type": "Phosphorylates", "effect": "activation"},
            {"source": "Parkin", "target": "VDAC1", "type": "Ubiquitinates", "effect": "tagging"},
            {"source": "VDAC1", "target": "OPTN", "type": "Binds", "effect": "recruitment"},
            {"source": "OPTN", "target": "LC3-II", "type": "Recruits", "effect": "mitophagy"}
        ]
    },
    "default": {
        "nodes": [
            {"id": "Target Receptor", "label": "Receptor", "description": "Transmembrane signal receiver."},
            {"id": "Intracellular Kinase", "label": "Kinase", "description": "Phosphorylation cascade transducer."},
            {"id": "Transcription Factor", "label": "TF", "description": "Regulates nuclear transcription profiles."}
        ],
        "edges": [
            {"source": "Target Receptor", "target": "Intracellular Kinase", "type": "Activates", "effect": "phosphorylation"},
            {"source": "Intracellular Kinase", "target": "Transcription Factor", "type": "Translocates", "effect": "gene_expression"}
        ]
    }
}

@app.get("/health")
def health():
    return {"status": "healthy", "service": "pathway-service"}

@app.get("/api/v1/pathways/{pathway_id}")
def get_pathway(pathway_id: str):
    """
    Retrieves pathways representing protein-protein signaling cascades.
    Queries the database (Neo4j bolt driver in production).
    """
    logger.info(f"Querying graph pathway for: {pathway_id}")
    
    # Simple clean string parsing to find pathway
    clean_id = pathway_id.lower()
    
    if "mitochondrial" in clean_id or "pink" in clean_id or "parkin" in clean_id:
        return BIOLOGICAL_PATHWAYS["mitochondrial_tagging"]
    
    return BIOLOGICAL_PATHWAYS["default"]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
