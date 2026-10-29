import { describe, it, expect } from "vitest";
import { VoiceSessionService } from "@/voice/voice-session";

describe("Milestone 7: ElevenLabs Voice Session Service", () => {
  it("rejects unauthenticated session requests with HTTP 401", async () => {
    const result = await VoiceSessionService.createSession({
      userId: undefined,
    });

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(401);
    expect(result.error).toContain("Unauthorized");
  });

  it("returns mock signed URL in offline / mock mode when API key is mock-api-key", async () => {
    const result = await VoiceSessionService.createSession({
      userId: "user-123",
      apiKey: "mock-api-key",
      agentId: "agent-demo-456",
    });

    expect(result.success).toBe(true);
    expect(result.agentId).toBe("agent-demo-456");
    expect(result.signedUrl).toContain("wss://api.elevenlabs.io");
    expect(result.signedUrl).toContain("mock_session_");
    expect(result.signedUrl).toContain("agent_id=agent-demo-456");
  });

  it("fetches signed session URL from ElevenLabs API when valid credentials are provided", async () => {
    const mockFetcher = async (url: string, init?: RequestInit) => {
      expect(url).toContain("agent_id=agent-custom-999");
      expect(init?.headers).toEqual(
        expect.objectContaining({
          "xi-api-key": "eleven-secret-key-xyz",
        })
      );
      return {
        ok: true,
        status: 200,
        json: async () => ({
          signed_url: "wss://api.elevenlabs.io/v1/convai/conversation?signed_token=live_token_777",
        }),
      };
    };

    const result = await VoiceSessionService.createSession({
      userId: "user-456",
      apiKey: "eleven-secret-key-xyz",
      agentId: "agent-custom-999",
      fetcher: mockFetcher as any,
    });

    expect(result.success).toBe(true);
    expect(result.signedUrl).toBe("wss://api.elevenlabs.io/v1/convai/conversation?signed_token=live_token_777");
    expect(result.agentId).toBe("agent-custom-999");
  });

  it("handles upstream ElevenLabs API error gracefully", async () => {
    const mockFetcher = async () => ({
      ok: false,
      status: 401,
      text: async () => "Invalid xi-api-key",
    });

    const result = await VoiceSessionService.createSession({
      userId: "user-456",
      apiKey: "bad-api-key",
      agentId: "agent-custom-999",
      fetcher: mockFetcher as any,
    });

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(401);
    expect(result.error).toContain("ElevenLabs session creation failed (401)");
  });
});
