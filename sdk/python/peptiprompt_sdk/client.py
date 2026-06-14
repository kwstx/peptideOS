import json
import logging
import requests
import websocket
from typing import Dict, Any, Callable, Optional

logger = logging.getLogger("peptiprompt-sdk")

class PeptiPromptClient:
    """
    Python SDK Client for interacting with the PeptiPrompt / peptideOS API.
    Provides methods for de novo peptide design, polling, WebSocket telemetry streaming,
    and retrieving regulatory-grade conformal prediction reports.
    """
    def __init__(self, api_key: str, base_url: str = "http://localhost:8000"):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

    def design_peptide(
        self,
        prompt: str,
        disease_state: str,
        target_protein: str,
        simulation_complexity: str = "standard",
        is_encrypted: bool = False,
        epsilon: float = 1.0,
        idempotency_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Triggers the asynchronous de novo sequence generation and multiscale simulation pipeline.
        """
        url = f"{self.base_url}/api/v1/peptides/design"
        payload = {
            "prompt": prompt,
            "disease_state": disease_state,
            "target_protein": target_protein,
            "user_id": "sdk_developer",
            "simulation_complexity": simulation_complexity,
            "is_encrypted": is_encrypted,
            "epsilon": epsilon
        }
        
        headers = self.headers.copy()
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
            
        response = requests.post(url, json=payload, headers=headers)
        if response.status_code != 200:
            raise RuntimeError(f"API Error {response.status_code}: {response.text}")
            
        return response.json()

    def get_design_details(self, design_id: str) -> Dict[str, Any]:
        """
        Retrieves the completed design metadata, including binding affinity, stability,
        Hill parameters, conformal safety bands, and Australia Group biosecurity checks.
        """
        url = f"{self.base_url}/api/v1/peptides/{design_id}"
        response = requests.get(url, headers=self.headers)
        if response.status_code != 200:
            raise RuntimeError(f"API Error {response.status_code}: {response.text}")
            
        return response.json()

    def download_compliance_report(self, design_id: str, output_path: str) -> None:
        """
        Downloads the regulatory-grade compliance report markdown file to local disk.
        """
        details = self.get_design_details(design_id)
        report_content = details.get("compliance_report", "")
        if not report_content:
            raise ValueError(f"No compliance report available yet for design {design_id}")
            
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(report_content)
        logger.info(f"Successfully saved compliance report to {output_path}")

    def stream_telemetry(self, design_id: str, callback: Callable[[Dict[str, Any]], None]) -> None:
        """
        Establishes a WebSocket connection to stream real-time physical simulation telemetry
        (conformation clusters, free energy estimation, Langevin solvers updates).
        """
        # Convert http(s) to ws(s)
        ws_scheme = "ws" if self.base_url.startswith("http://") else "wss"
        cleaned_url = self.base_url.replace("http://", "").replace("https://", "")
        ws_url = f"{ws_scheme}://{cleaned_url}/ws/telemetry/{design_id}"
        
        def on_message(ws, message):
            try:
                data = json.loads(message)
                callback(data)
            except Exception as e:
                logger.error(f"Error parsing websocket message: {e}")
                
        def on_error(ws, error):
            logger.error(f"WebSocket Error: {error}")
            
        def on_close(ws, close_status_code, close_msg):
            logger.info("WebSocket connection closed.")

        ws = websocket.WebSocketApp(
            ws_url,
            on_message=on_message,
            on_error=on_error,
            on_close=on_close
        )
        logger.info(f"Connecting to telemetry stream: {ws_url}")
        ws.run_forever()
