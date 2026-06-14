import WebSocket from 'isomorphic-ws';

export interface DesignRequest {
  prompt: string;
  diseaseState: string;
  targetProtein: string;
  simulationComplexity?: 'standard' | 'high_fidelity' | 'deep';
  isEncrypted?: boolean;
  epsilon?: number;
}

export interface DesignResponse {
  status: string;
  design_id: string;
  message: string;
}

export interface DesignDetails {
  design_id: string;
  prompt: string;
  disease_state: string;
  target_protein: string;
  status: string;
  sequence: string;
  binding_affinity: number;
  stability: number;
  synthesis_script: string;
  therapeutic_index: number | null;
  ti_lower: number | null;
  ti_upper: number | null;
  adverse_events: Record<string, any> | null;
  dose_response: Record<string, any> | null;
  compliance_report: string;
  is_encrypted: boolean;
  provenance_token: string;
  biosecurity_status: string;
  consent_token: string;
  epsilon: number;
}

export class PeptiPromptSDK {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = 'http://localhost:8000') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private get headers(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Triggers the de novo peptide design pipeline asynchronously.
   */
  async designPeptide(request: DesignRequest, idempotencyKey?: string): Promise<DesignResponse> {
    const url = `${this.baseUrl}/api/v1/peptides/design`;
    const body = {
      prompt: request.prompt,
      disease_state: request.diseaseState,
      target_protein: request.targetProtein,
      user_id: 'sdk_ts_developer',
      simulation_complexity: request.simulationComplexity || 'standard',
      is_encrypted: !!request.isEncrypted,
      epsilon: request.epsilon !== undefined ? request.epsilon : 1.0
    };

    const headers = { ...this.headers };
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`PeptiPrompt SDK Error: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Retrieves completed metadata, structural affinity, and regulatory compliance reports.
   */
  async getDesignDetails(designId: string): Promise<DesignDetails> {
    const url = `${this.baseUrl}/api/v1/peptides/${designId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.headers
    });

    if (!response.ok) {
      throw new Error(`PeptiPrompt SDK Error: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Establishes a WebSocket connection for streaming molecular dynamics and trajectory updates.
   */
  streamTelemetry(designId: string, onMessage: (data: any) => void, onError?: (err: any) => void): WebSocket {
    const wsScheme = this.baseUrl.startsWith('http://') ? 'ws' : 'wss';
    const cleanUrl = this.baseUrl.replace(/^https?:\/\//, '');
    const wsUrl = `${wsScheme}://${cleanUrl}/ws/telemetry/${designId}`;

    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data.toString());
        onMessage(data);
      } catch (err) {
        if (onError) onError(err);
      }
    };

    if (onError) {
      ws.onerror = onError;
    }

    return ws;
  }
}
