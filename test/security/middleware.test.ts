import { describe, it, expect } from "vitest";
import crypto from "crypto";
import {
  verifyTelegramWebhook,
  verifySlackSignature,
  verifyCronSecret,
} from "@/security/middleware";

describe("Milestone 1 Security Controls", () => {
  describe("T-001 & T-002: Telegram Webhook Secret Token Verification", () => {
    const expectedSecret = "super-secret-token-12345";

    it("accepts requests with exact matching secret token", () => {
      const result = verifyTelegramWebhook({
        secretTokenHeader: expectedSecret,
        expectedSecretToken: expectedSecret,
      });
      expect(result.authorized).toBe(true);
      expect(result.statusCode).toBe(200);
    });

    it("rejects missing secret token with HTTP 401", () => {
      const result = verifyTelegramWebhook({
        secretTokenHeader: undefined,
        expectedSecretToken: expectedSecret,
      });
      expect(result.authorized).toBe(false);
      expect(result.statusCode).toBe(401);
    });

    it("rejects non-matching secret token with HTTP 401", () => {
      const result = verifyTelegramWebhook({
        secretTokenHeader: "tampered-token",
        expectedSecretToken: expectedSecret,
      });
      expect(result.authorized).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.reason).toBe("Invalid secret token");
    });
  });

  describe("T-003: Telegram Chat and User Allowlist Enforcement", () => {
    const secret = "secret-token-ok";
    const allowedChat = "123456789";
    const allowedUsers = ["111", "222", "333"];

    it("authorizes allowed chat and allowed user", () => {
      const result = verifyTelegramWebhook({
        secretTokenHeader: secret,
        expectedSecretToken: secret,
        senderChatId: allowedChat,
        senderUserId: "222",
        allowedChatId: allowedChat,
        allowedUserIds: allowedUsers,
      });
      expect(result.authorized).toBe(true);
      expect(result.statusCode).toBe(200);
    });

    it("rejects unauthorized chat ID with HTTP 403", () => {
      const result = verifyTelegramWebhook({
        secretTokenHeader: secret,
        expectedSecretToken: secret,
        senderChatId: "999999999",
        senderUserId: "111",
        allowedChatId: allowedChat,
        allowedUserIds: allowedUsers,
      });
      expect(result.authorized).toBe(false);
      expect(result.statusCode).toBe(403);
      expect(result.reason).toContain("Unauthorized Telegram chat ID");
    });

    it("rejects unauthorized user ID with HTTP 403", () => {
      const result = verifyTelegramWebhook({
        secretTokenHeader: secret,
        expectedSecretToken: secret,
        senderChatId: allowedChat,
        senderUserId: "888",
        allowedChatId: allowedChat,
        allowedUserIds: allowedUsers,
      });
      expect(result.authorized).toBe(false);
      expect(result.statusCode).toBe(403);
      expect(result.reason).toContain("Unauthorized Telegram user ID");
    });
  });

  describe("Slack HMAC-SHA256 Signature and Replay Protection", () => {
    const signingSecret = "slack-signing-secret-abc";
    const rawBody = JSON.stringify({ type: "event_callback", event: { text: "Hello" } });

    it("accepts valid Slack signature within acceptable timestamp window", () => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const sigBasestring = `v0:${timestamp}:${rawBody}`;
      const signature = `v0=${crypto.createHmac("sha256", signingSecret).update(sigBasestring).digest("hex")}`;

      const result = verifySlackSignature({
        signatureHeader: signature,
        timestampHeader: timestamp,
        rawBody,
        signingSecret,
      });
      expect(result.authorized).toBe(true);
      expect(result.statusCode).toBe(200);
    });

    it("rejects expired Slack timestamps (replay attack prevention) with HTTP 401", () => {
      // 10 minutes in the past
      const expiredTimestamp = String(Math.floor(Date.now() / 1000) - 600);
      const sigBasestring = `v0:${expiredTimestamp}:${rawBody}`;
      const signature = `v0=${crypto.createHmac("sha256", signingSecret).update(sigBasestring).digest("hex")}`;

      const result = verifySlackSignature({
        signatureHeader: signature,
        timestampHeader: expiredTimestamp,
        rawBody,
        signingSecret,
      });
      expect(result.authorized).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.reason).toContain("replay protection");
    });

    it("rejects tampered body or invalid signature with HTTP 401", () => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = "v0=badbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadb";

      const result = verifySlackSignature({
        signatureHeader: signature,
        timestampHeader: timestamp,
        rawBody,
        signingSecret,
      });
      expect(result.authorized).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.reason).toContain("mismatch");
    });
  });

  describe("Cron Bearer-Secret Authorization", () => {
    const cronSecret = "cron-token-xyz-789";

    it("authorizes valid Bearer cron secret header", () => {
      const result = verifyCronSecret({
        authorizationHeader: `Bearer ${cronSecret}`,
        expectedCronSecret: cronSecret,
      });
      expect(result.authorized).toBe(true);
      expect(result.statusCode).toBe(200);
    });

    it("rejects missing authorization header with HTTP 401", () => {
      const result = verifyCronSecret({
        authorizationHeader: undefined,
        expectedCronSecret: cronSecret,
      });
      expect(result.authorized).toBe(false);
      expect(result.statusCode).toBe(401);
    });

    it("rejects non-Bearer or invalid token format", () => {
      const result = verifyCronSecret({
        authorizationHeader: `Basic ${cronSecret}`,
        expectedCronSecret: cronSecret,
      });
      expect(result.authorized).toBe(false);
      expect(result.statusCode).toBe(401);
    });

    it("rejects wrong secret with HTTP 401", () => {
      const result = verifyCronSecret({
        authorizationHeader: "Bearer wrong-token",
        expectedCronSecret: cronSecret,
      });
      expect(result.authorized).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.reason).toBe("Invalid Cron secret token");
    });
  });
});
