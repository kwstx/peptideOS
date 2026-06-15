import os
import json
import time
import hashlib
import hmac
import base64
import logging
import numpy as np
from typing import Dict, Any, List, Tuple, Optional
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

logger = logging.getLogger("governance-module")

# Shared system security key for audit trail HMAC signing
SYSTEM_AUDIT_SECRET = os.getenv("SYSTEM_AUDIT_SECRET", "super-secret-governance-key-999").encode()
# Default encryption key for biomolecular queries (E2EE demonstration)
DEFAULT_WORKSPACE_KEY = base64.b64decode(os.getenv("WORKSPACE_CRYPTO_KEY", "c3VwZXJzZWNyZXRra2V5c3VwZXJzZWNyZXRra2V5MTI=")) # 32 bytes

# Biosecurity select agent toxin sequences to screen (Australia Group & CDC Select Agents)
# In real systems, this screens against pathogen databases (e.g. Ricin, Botulinum, Anthrax, Ebola spike)
BIOSECURITY_BLACKLIST = {
    # Sequence pattern: Toxin name
    "TFT": "Ricin Toxin A-Chain",
    "CWD": "Botulinum Neurotoxin",
    "LFY": "Bacillus anthracis Lethal Factor",
    "KLV": "Beta-Amyloid Neurotoxic Aggregators (Dual-Use Risk)",
    "VVA": "Abrin Select Agent Toxin",
}

class CryptographicManager:
    """
    Handles End-to-End Encryption (E2EE) for biomolecular queries and results.
    Uses AES-256-GCM authenticated encryption.
    """
    @staticmethod
    def generate_session_key() -> str:
        key = AESGCM.generate_key(bit_length=256)
        return base64.b64encode(key).decode('utf-8')

    @staticmethod
    def encrypt(data_dict: Dict[str, Any], key_b64: str = None) -> str:
        """Encrypts data dictionary into a secure AES-GCM base64 string."""
        try:
            key = base64.b64decode(key_b64) if key_b64 else DEFAULT_WORKSPACE_KEY
            aesgcm = AESGCM(key)
            nonce = os.urandom(12)
            data_bytes = json.dumps(data_dict).encode('utf-8')
            ciphertext = aesgcm.encrypt(nonce, data_bytes, None)
            
            # Pack nonce + ciphertext
            packed = nonce + ciphertext
            return base64.b64encode(packed).decode('utf-8')
        except Exception as e:
            logger.error(f"Encryption failed: {e}")
            raise ValueError(f"E2EE Encryption Error: {str(e)}")

    @staticmethod
    def decrypt(encrypted_str: str, key_b64: str = None) -> Dict[str, Any]:
        """Decrypts a secure AES-GCM base64 string back to a data dictionary."""
        try:
            key = base64.b64decode(key_b64) if key_b64 else DEFAULT_WORKSPACE_KEY
            aesgcm = AESGCM(key)
            packed = base64.b64decode(encrypted_str)
            if len(packed) < 12:
                raise ValueError("Ciphertext too short")
            
            nonce = packed[:12]
            ciphertext = packed[12:]
            decrypted_bytes = aesgcm.decrypt(nonce, ciphertext, None)
            return json.loads(decrypted_bytes.decode('utf-8'))
        except Exception as e:
            logger.error(f"Decryption failed: {e}")
            raise ValueError(f"E2EE Decryption Error: {str(e)}")


class ImmutableAuditLedger:
    """
    Maintains an immutable cryptographic hash chain of all simulation and generation events.
    Verifies history on start or query to guarantee tamper-proof audit trails.
    """
    @staticmethod
    def compute_block_hash(index: int, timestamp: float, action: str, details_hash: str, prev_hash: str) -> str:
        """Computes the block SHA-256 hash."""
        block_content = f"{index}|{timestamp}|{action}|{details_hash}|{prev_hash}"
        return hashlib.sha256(block_content.encode('utf-8')).hexdigest()

    @staticmethod
    def compute_signature(block_hash: str) -> str:
        """Computes HMAC-SHA256 signature to prevent ledger re-writing."""
        return hmac.new(SYSTEM_AUDIT_SECRET, block_hash.encode('utf-8'), hashlib.sha256).hexdigest()

    @classmethod
    def create_log_entry(cls, conn, action: str, details: Dict[str, Any]) -> Dict[str, Any]:
        """
        Creates a new signed block in the PostgreSQL audit log and validates chain consistency.
        """
        cursor = conn.cursor()
        
        # Get last block details
        cursor.execute("SELECT index, block_hash FROM audit_logs ORDER BY index DESC LIMIT 1;")
        row = cursor.fetchone()
        
        if row:
            prev_index, prev_hash = row[0], row[1]
            new_index = prev_index + 1
        else:
            prev_hash = "GENESIS_BLOCK_0000000000000000000000000000000000000000000000000000000"
            new_index = 0
            
        timestamp = time.time()
        details_str = json.dumps(details)
        details_hash = hashlib.sha256(details_str.encode('utf-8')).hexdigest()
        
        block_hash = cls.compute_block_hash(new_index, timestamp, action, details_hash, prev_hash)
        signature = cls.compute_signature(block_hash)
        
        cursor.execute(
            """
            INSERT INTO audit_logs (index, timestamp, action, details, details_hash, prev_hash, block_hash, signature)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
            """,
            (new_index, timestamp, action, details_str, details_hash, prev_hash, block_hash, signature)
        )
        conn.commit()
        cursor.close()
        
        logger.info(f"Audit log index {new_index} committed for action '{action}'. Hash: {block_hash[:10]}")
        return {
            "index": new_index,
            "timestamp": timestamp,
            "action": action,
            "block_hash": block_hash,
            "prev_hash": prev_hash,
            "signature": signature
        }

    @classmethod
    def verify_ledger_integrity(cls, conn) -> Tuple[bool, List[Dict[str, Any]]]:
        """
        Traverses the complete audit logs hash chain and verifies all HMAC signatures.
        Detects tampering instantly.
        """
        cursor = conn.cursor()
        cursor.execute("SELECT index, timestamp, action, details, details_hash, prev_hash, block_hash, signature FROM audit_logs ORDER BY index ASC;")
        rows = cursor.fetchall()
        cursor.close()
        
        expected_prev = "GENESIS_BLOCK_0000000000000000000000000000000000000000000000000000000"
        ledger_report = []
        is_valid = True
        
        for index, row in enumerate(rows):
            idx, ts, action, details, det_hash, prev, curr_hash, sig = row
            
            # 1. Check Index order
            if idx != index:
                logger.error(f"Audit Log integrity violation: Block index mismatch expected {index}, got {idx}")
                is_valid = False
            
            # 2. Check Hash Chain Link
            if prev != expected_prev:
                logger.error(f"Audit Log integrity violation at block {idx}: previous hash link broken")
                is_valid = False
                
            # 3. Check details content hash
            computed_details_hash = hashlib.sha256(details.encode('utf-8')).hexdigest()
            if computed_details_hash != det_hash:
                logger.error(f"Audit Log integrity violation at block {idx}: Details payload was tampered")
                is_valid = False
                
            # 4. Check Block Hash
            computed_hash = cls.compute_block_hash(idx, ts, action, det_hash, prev)
            if computed_hash != curr_hash:
                logger.error(f"Audit Log integrity violation at block {idx}: hash calculation mismatch")
                is_valid = False
                
            # 5. Verify Cryptographic Signature
            computed_sig = cls.compute_signature(curr_hash)
            if computed_sig != sig:
                logger.error(f"Audit Log integrity violation at block {idx}: signature mismatch (tampered secret)")
                is_valid = False
                
            ledger_report.append({
                "index": idx,
                "timestamp": ts,
                "action": action,
                "prev_hash": prev,
                "block_hash": curr_hash,
                "signature": sig,
                "integrity_valid": computed_sig == sig and computed_hash == curr_hash and prev == expected_prev and computed_details_hash == det_hash and idx == index
            })
            expected_prev = curr_hash
            
        return is_valid, ledger_report


class DifferentialPrivacyManager:
    """
    Implements mathematical privacy-preserving techniques.
    Injects Laplace noise during model inference and simulates DP-SGD gradient clipping/noise.
    """
    @staticmethod
    def inject_laplace_noise(value: float, sensitivity: float, epsilon: float) -> float:
        """
        Adds Laplace noise to a scalar response.
        Scale of noise = Sensitivity / Epsilon.
        """
        if epsilon <= 0:
            return value
        scale = sensitivity / epsilon
        noise = np.random.laplace(0.0, scale)
        return float(value + noise)

    @staticmethod
    def simulate_dpsgd_training(gradients: np.ndarray, clip_bound: float, epsilon: float, delta: float) -> Tuple[np.ndarray, float]:
        """
        Simulates training-time DP-SGD by clipping gradients and injecting Gaussian noise.
        Returns the DP-gradients and computed noise standard deviation.
        """
        # 1. Clip gradients: g = g / max(1, ||g||_2 / C)
        grad_norm = np.linalg.norm(gradients)
        clip_coef = min(1.0, clip_bound / (grad_norm + 1e-6))
        clipped_gradients = gradients * clip_coef
        
        # 2. Inject Gaussian noise: N(0, sigma^2 * C^2 * I)
        # Using standard DP-SGD budget translation
        sigma = np.sqrt(2 * np.log(1.25 / delta)) / epsilon
        noise_std = sigma * clip_bound
        noise = np.random.normal(0.0, noise_std, size=gradients.shape)
        
        dp_gradients = clipped_gradients + noise
        return dp_gradients, noise_std


class ComplianceValidator:
    """
    Enforces compliance constraints: data minimization, user consent logging,
    and regulatory biosecurity screening of generated output.
    """
    @staticmethod
    def enforce_data_minimization(request_payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Data Minimization: Strips PII and unrelated metadata before feeding it to processing loops.
        Keeps only parameters strictly required for sequence generation & simulation.
        """
        allowed_keys = {"prompt", "disease_state", "target_protein", "simulation_complexity", "sequence_length", "off_target_tolerance"}
        minimized = {k: v for k, v in request_payload.items() if k in allowed_keys}
        
        # Scrub hypothetical PII or location identifiers if present in text
        # (e.g., if user added their email or phone in prompt, scrub it)
        # Simple regex scrubbing simulated here
        import re
        if "prompt" in minimized and isinstance(minimized["prompt"], str):
            text = minimized["prompt"]
            text = re.sub(r'[\w\.-]+@[\w\.-]+\.\w+', '[REDACTED_EMAIL]', text)
            text = re.sub(r'\+?\d{1,4}?[-.\s]?\(?\d{1,3}?\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}', '[REDACTED_PHONE]', text)
            minimized["prompt"] = text
            
        return minimized

    @staticmethod
    def log_consent(conn, user_id: str, consent_type: str) -> str:
        """
        Consent Logging: Logs user consent on a dedicated secure ledger.
        """
        cursor = conn.cursor()
        timestamp = time.time()
        consent_token = hashlib.sha256(f"{user_id}|{consent_type}|{timestamp}".encode('utf-8')).hexdigest()
        
        cursor.execute(
            """
            INSERT INTO consent_logs (user_id, consent_type, timestamp, consent_token)
            VALUES (%s, %s, %s, %s);
            """,
            (user_id, consent_type, timestamp, consent_token)
        )
        conn.commit()
        cursor.close()
        
        logger.info(f"Consent logged for user {user_id}. Token: {consent_token[:8]}")
        return consent_token

    @staticmethod
    def screen_biosecurity(sequence: str) -> Tuple[bool, List[str]]:
        """
        Regulatory Screening: Checks sequence strings against known biosecurity threat lists
        (dual-use select agents, toxic peptides, toxin precursors).
        Returns (is_cleared, violation_warnings).
        """
        # Normalize sequence
        normalized = sequence.replace("-NH2", "").replace(" ", "").upper()
        violations = []
        is_cleared = True
        
        for pattern, toxin_name in BIOSECURITY_BLACKLIST.items():
            if pattern in normalized:
                is_cleared = False
                violations.append(f"Sequence match found for dual-use regulated agent: {toxin_name} (Pattern: '{pattern}')")
                
        return is_cleared, violations


class ProvenanceTracker:
    """
    Maintains traceability from the user's prompt through parsed entities, diffusion stages,
    simulation solvers, and the predicted therapeutic candidate.
    Generates a cryptographically signed Lineage Provenance Token.
    """
    @staticmethod
    def generate_provenance_token(
        prompt: str,
        nlp_entities: Dict[str, Any],
        diffusion_latent_hash: str,
        simulation_id: str,
        final_sequence: str
    ) -> Dict[str, Any]:
        """
        Generates and signs a sequence lineage provenance record.
        """
        lineage = {
            "prompt_hash": hashlib.sha256(prompt.encode('utf-8')).hexdigest(),
            "nlp_entities": nlp_entities,
            "diffusion_latent_hash": diffusion_latent_hash,
            "simulation_id": simulation_id,
            "final_sequence_hash": hashlib.sha256(final_sequence.encode('utf-8')).hexdigest(),
            "timestamp": time.time(),
            "framework_version": "peptideOS-governance-v1.0"
        }
        
        # Create HMAC signature of the lineage structure to secure authenticity
        lineage_bytes = json.dumps(lineage, sort_keys=True).encode('utf-8')
        signature = hmac.new(SYSTEM_AUDIT_SECRET, lineage_bytes, hashlib.sha256).hexdigest()
        
        return {
            "lineage": lineage,
            "provenance_token": f"prov_{signature[:32]}",
            "provenance_signature": signature
        }
