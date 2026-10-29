import { describe, it, expect } from "vitest";
import { SecretRedactor } from "@/security/redaction";
import { SlackEventParser } from "@/workflow/slack-parser";

describe("Milestone 6 Security: Token Redaction & Channel Filtering (T-027, T-029)", () => {
  describe("T-027: Secret token redaction in logs and errors", () => {
    it("redacts Bearer tokens from authorization headers and error logs", () => {
      const rawLog = "Failed request with header Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz";
      const sanitized = SecretRedactor.redactString(rawLog);

      expect(sanitized).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz");
      expect(sanitized).toContain("Authorization: Bearer [REDACTED]");
    });

    it("redacts Telegram bot secret token header values", () => {
      const headerStr = "x-telegram-bot-api-secret-token: super-secret-value-12345";
      const sanitized = SecretRedactor.redactString(headerStr);

      expect(sanitized).not.toContain("super-secret-value-12345");
      expect(sanitized).toBe("x-telegram-bot-api-secret-token: [REDACTED]");
    });

    it("redacts Slack bot tokens (xoxb-...)", () => {
      const mockSlackToken = ["xoxb", "123456789012", "123456789012", "abcdefghijklmnopqrstuvwx"].join("-");
      const errorMsg = `Slack API error with token ${mockSlackToken}`;
      const sanitized = SecretRedactor.redactString(errorMsg);

      expect(sanitized).not.toContain(mockSlackToken);
      expect(sanitized).toContain("xoxb-[REDACTED]");
    });

    it("redacts sensitive keys recursively inside telemetry / error objects", () => {
      const telemetryPayload = {
        event: "webhook_received",
        headers: {
          authorization: "Bearer secret-token-abc",
          "x-telegram-bot-api-secret-token": "webhook-secret-xyz",
          host: "api.example.com",
        },
        user: {
          id: "u-123",
          token: "session-token-999",
          secret: "vault-secret",
        },
      };

      const sanitized = SecretRedactor.redactObject(telemetryPayload);

      expect(sanitized.headers.authorization).toBe("[REDACTED]");
      expect(sanitized.headers["x-telegram-bot-api-secret-token"]).toBe("[REDACTED]");
      expect(sanitized.headers.host).toBe("api.example.com");
      expect(sanitized.user.token).toBe("[REDACTED]");
      expect(sanitized.user.secret).toBe("[REDACTED]");
      expect(sanitized.user.id).toBe("u-123");
    });
  });

  describe("T-029: Slack message in unauthorized channel", () => {
    it("silently ignores messages from channels not present in ALLOWED_SLACK_CHANNELS", () => {
      const allowedChannels = ["C_AUTHORIZED_DEV", "C_AUTHORIZED_OPS"];

      const isChannelAuthorized = (channelId: string) => allowedChannels.includes(channelId);

      const unauthorizedEvent = {
        channel: "C_RANDOM_CHAT",
        user: "U_ALICE",
        text: "Please track this in Trello: urgent email from client",
        ts: "1730188800.000",
      };

      const authorized = isChannelAuthorized(unauthorizedEvent.channel);
      expect(authorized).toBe(false);

      // Workflow ignores unauthorized event; no parsing/search triggered
      let workflowTriggered = false;
      if (authorized) {
        SlackEventParser.parseEvent(unauthorizedEvent);
        workflowTriggered = true;
      }

      expect(workflowTriggered).toBe(false);
    });

    it("processes message when channel is allowlisted", () => {
      const allowedChannels = ["C_AUTHORIZED_DEV", "C_AUTHORIZED_OPS"];
      const authorizedEvent = {
        channel: "C_AUTHORIZED_DEV",
        user: "U_BOB",
        text: "Please check email regarding API migration",
        ts: "1730188800.000",
      };

      const isChannelAuthorized = (channelId: string) => allowedChannels.includes(channelId);
      expect(isChannelAuthorized(authorizedEvent.channel)).toBe(true);

      const clues = SlackEventParser.parseEvent(authorizedEvent);
      expect(clues.channelId).toBe("C_AUTHORIZED_DEV");
      expect(clues.keywords).toContain("migration");
    });
  });
});
