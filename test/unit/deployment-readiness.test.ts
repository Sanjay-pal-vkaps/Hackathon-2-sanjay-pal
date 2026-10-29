import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GoogleAuthHelper } from "@/adapters/google-auth";
import { POST as voiceToolsHandler } from "@/app/api/voice/tools/route";
import { GET as cronGetHandler, POST as cronPostHandler } from "@/app/api/cron/evaluate/route";
import { POST as telegramWebhookHandler } from "@/app/api/webhooks/telegram/route";
import { POST as slackWebhookHandler } from "@/app/api/webhooks/slack/route";
import { NextRequest } from "next/server";

describe("Milestone 7 Deployment Readiness Suite", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    GoogleAuthHelper.clearCache();
  });

  afterEach(() => {
    process.env = originalEnv;
    GoogleAuthHelper.clearCache();
  });

  describe("Google OAuth Token Resolution & Refresh", () => {
    it("returns static GOOGLE_ACCESS_TOKEN if set", async () => {
      process.env.GOOGLE_ACCESS_TOKEN = "ya29.static_access_token";
      const token = await GoogleAuthHelper.getAccessToken();
      expect(token).toBe("ya29.static_access_token");
    });

    it("exchanges refresh token when client credentials are provided", async () => {
      delete process.env.GOOGLE_ACCESS_TOKEN;
      process.env.GOOGLE_CLIENT_ID = "test-client-id";
      process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
      process.env.GOOGLE_REFRESH_TOKEN = "1//real_refresh_token";

      const mockFetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: "ya29.exchanged_fresh_token",
          expires_in: 3600,
          token_type: "Bearer",
        }),
      });

      const token = await GoogleAuthHelper.getAccessToken({ fetcher: mockFetcher as any });
      expect(token).toBe("ya29.exchanged_fresh_token");
      expect(mockFetcher).toHaveBeenCalledWith(
        "https://oauth2.googleapis.com/token",
        expect.objectContaining({ method: "POST" })
      );
    });

    it("falls back to refresh token string for mock tests", async () => {
      delete process.env.GOOGLE_ACCESS_TOKEN;
      process.env.GOOGLE_REFRESH_TOKEN = "mock_refresh_token";

      const token = await GoogleAuthHelper.getAccessToken();
      expect(token).toBe("mock_refresh_token");
    });
  });

  describe("ElevenLabs Webhook Authentication (/api/voice/tools)", () => {
    it("rejects unauthenticated requests with 401 when ELEVENLABS_WEBHOOK_SECRET is set", async () => {
      process.env.ELEVENLABS_WEBHOOK_SECRET = "super-secret-voice-token";

      const req = new NextRequest("http://localhost:3000/api/voice/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool_name: "get_daily_summary" }),
      });

      const res = await voiceToolsHandler(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error).toContain("Unauthorized: Missing webhook secret token");
    });

    it("rejects invalid webhook secret with 401", async () => {
      process.env.ELEVENLABS_WEBHOOK_SECRET = "super-secret-voice-token";

      const req = new NextRequest("http://localhost:3000/api/voice/tools", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-webhook-secret": "wrong-attacker-token",
        },
        body: JSON.stringify({ tool_name: "get_daily_summary" }),
      });

      const res = await voiceToolsHandler(req);
      expect(res.status).toBe(401);
    });

    it("accepts valid Bearer token matching ELEVENLABS_WEBHOOK_SECRET", async () => {
      process.env.ELEVENLABS_WEBHOOK_SECRET = "super-secret-voice-token";

      const req = new NextRequest("http://localhost:3000/api/voice/tools", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer super-secret-voice-token",
        },
        body: JSON.stringify({ tool_name: "get_daily_summary" }),
      });

      const res = await voiceToolsHandler(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe("Vercel Cron Route (/api/cron/evaluate)", () => {
    it("rejects unauthenticated cron request with 401 when CRON_SECRET is set", async () => {
      process.env.CRON_SECRET = "top-secret-cron-token";

      const req = new NextRequest("http://localhost:3000/api/cron/evaluate", {
        method: "GET",
      });

      const res = await cronGetHandler(req);
      expect(res.status).toBe(401);
    });

    it("executes schedule evaluation on GET with valid Bearer token", async () => {
      process.env.CRON_SECRET = "top-secret-cron-token";

      const req = new NextRequest("http://localhost:3000/api/cron/evaluate", {
        method: "GET",
        headers: {
          Authorization: "Bearer top-secret-cron-token",
        },
      });

      const res = await cronGetHandler(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data).toHaveProperty("triggered");
    });

    it("executes schedule evaluation on POST with valid Bearer token", async () => {
      process.env.CRON_SECRET = "top-secret-cron-token";

      const req = new NextRequest("http://localhost:3000/api/cron/evaluate", {
        method: "POST",
        headers: {
          Authorization: "Bearer top-secret-cron-token",
        },
      });

      const res = await cronPostHandler(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe("Webhooks Authentication & Verification", () => {
    it("rejects unauthorized Telegram webhook request when TELEGRAM_WEBHOOK_SECRET is set", async () => {
      process.env.TELEGRAM_WEBHOOK_SECRET = "tg-secret-123";

      const req = new NextRequest("http://localhost:3000/api/webhooks/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: { text: "hello" } }),
      });

      const res = await telegramWebhookHandler(req);
      expect(res.status).toBe(401);
    });

    it("handles Slack url_verification challenge successfully", async () => {
      const challengeToken = "challenge-string-abc-123";
      const req = new NextRequest("http://localhost:3000/api/webhooks/slack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "url_verification", challenge: challengeToken }),
      });

      const res = await slackWebhookHandler(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.challenge).toBe(challengeToken);
    });
  });
});
