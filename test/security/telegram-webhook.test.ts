import { describe, it, expect } from "vitest";
import { verifyTelegramWebhook } from "@/security/middleware";

describe("Milestone 6 Security: Telegram Webhook Protection (T-001, T-002, T-003)", () => {
  const secret = "telegram-secret-token-xyz-123";
  const allowedChatId = "100200300";
  const allowedUserIds = ["100200300", "999888777"];

  describe("T-001: Unauthenticated webhook request", () => {
    it("denies requests with completely missing secret token header with HTTP 401", () => {
      const result = verifyTelegramWebhook({
        secretTokenHeader: undefined,
        expectedSecretToken: secret,
      });

      expect(result.authorized).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.reason).toContain("Missing secret token header");
    });

    it("denies empty string secret token with HTTP 401", () => {
      const result = verifyTelegramWebhook({
        secretTokenHeader: "",
        expectedSecretToken: secret,
      });

      expect(result.authorized).toBe(false);
      expect(result.statusCode).toBe(401);
    });
  });

  describe("T-002: Invalid X-Telegram-Bot-Api-Secret-Token", () => {
    it("rejects invalid secret tokens immediately with HTTP 401 without processing body", () => {
      const result = verifyTelegramWebhook({
        secretTokenHeader: "attacker-wrong-secret",
        expectedSecretToken: secret,
      });

      expect(result.authorized).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.reason).toBe("Invalid secret token");
    });
  });

  describe("T-003: Unauthorized Telegram chat or user ID allowlist enforcement", () => {
    it("authorizes request when both chat ID and user ID are allowlisted", () => {
      const result = verifyTelegramWebhook({
        secretTokenHeader: secret,
        expectedSecretToken: secret,
        senderChatId: allowedChatId,
        senderUserId: "100200300",
        allowedChatId,
        allowedUserIds,
      });

      expect(result.authorized).toBe(true);
      expect(result.statusCode).toBe(200);
    });

    it("rejects unauthorized chat ID with HTTP 403 even if secret token is valid", () => {
      const result = verifyTelegramWebhook({
        secretTokenHeader: secret,
        expectedSecretToken: secret,
        senderChatId: "evil-chat-id-666",
        senderUserId: "100200300",
        allowedChatId,
        allowedUserIds,
      });

      expect(result.authorized).toBe(false);
      expect(result.statusCode).toBe(403);
      expect(result.reason).toBe("Unauthorized Telegram chat ID");
    });

    it("rejects unauthorized user ID with HTTP 403 even if chat ID is allowed", () => {
      const result = verifyTelegramWebhook({
        secretTokenHeader: secret,
        expectedSecretToken: secret,
        senderChatId: allowedChatId,
        senderUserId: "unauthorized-user-555",
        allowedChatId,
        allowedUserIds,
      });

      expect(result.authorized).toBe(false);
      expect(result.statusCode).toBe(403);
      expect(result.reason).toBe("Unauthorized Telegram user ID");
    });
  });
});
