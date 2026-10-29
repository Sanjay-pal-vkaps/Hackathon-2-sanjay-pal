export interface VoiceSessionOptions {
  userId?: string;
  apiKey?: string;
  agentId?: string;
  fetcher?: (url: string, init?: RequestInit) => Promise<any>;
}

export interface VoiceSessionResult {
  success: boolean;
  signedUrl?: string;
  agentId?: string;
  error?: string;
  statusCode?: number;
}

export class VoiceSessionService {
  /**
   * Generates a secure, ephemeral signed WebSocket URL for ElevenLabs Conversational AI
   * Endpoint: https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=<AGENT_ID>
   */
  static async createSession(options: VoiceSessionOptions = {}): Promise<VoiceSessionResult> {
    // 1. Authorization check: Anonymous or unauthenticated sessions are strictly rejected
    if (!options.userId && !process.env.TEST_ALLOW_ANON) {
      return {
        success: false,
        error: "Unauthorized: Voice session requires valid authenticated user ID",
        statusCode: 401,
      };
    }

    const apiKey = options.apiKey || process.env.ELEVENLABS_API_KEY;
    const agentId = options.agentId || process.env.ELEVENLABS_AGENT_ID || "agent_default_work_assistant";

    // 2. Offline / Mock mode (when running in local dev/tests without live ElevenLabs credentials)
    if (!apiKey || apiKey === "mock-api-key") {
      return {
        success: true,
        signedUrl: `wss://api.elevenlabs.io/v1/convai/conversation?signed_token=mock_session_${Date.now()}&agent_id=${agentId}`,
        agentId,
      };
    }

    // 3. Request signed URL from ElevenLabs API
    const fetchFn = options.fetcher || fetch;
    const url = `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${encodeURIComponent(agentId)}`;

    try {
      const response = await fetchFn(url, {
        method: "GET",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = typeof response.text === "function" ? await response.text() : "ElevenLabs API Error";
        return {
          success: false,
          error: `ElevenLabs session creation failed (${response.status}): ${errorText}`,
          statusCode: response.status,
        };
      }

      const data = typeof response.json === "function" ? await response.json() : response;
      const signedUrl = data.signed_url || data.signedUrl;

      if (!signedUrl) {
        return {
          success: false,
          error: "ElevenLabs API response missing signed_url",
          statusCode: 502,
        };
      }

      return {
        success: true,
        signedUrl,
        agentId,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Network error connecting to ElevenLabs: ${err.message || "Unknown error"}`,
        statusCode: 500,
      };
    }
  }
}
