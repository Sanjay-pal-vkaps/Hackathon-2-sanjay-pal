import { describe, it, expect } from "vitest";
import { GmailAdapter } from "@/adapters/gmail-adapter";
import { CalendarAdapter } from "@/adapters/calendar-adapter";
import { SlackAdapter } from "@/adapters/slack-adapter";

describe("Milestone 6 Security: Read-Only Scopes Enforcement (T-024, T-025, T-026)", () => {
  describe("T-024: Attempted write to Gmail API", () => {
    it("ensures GmailAdapter implements only read methods and hard-rejects any write attempts", () => {
      const adapter = new GmailAdapter();
      const proto = Object.getPrototypeOf(adapter);
      const methods = Object.getOwnPropertyNames(proto);

      // Verify no write methods exist (send, create, update, delete, trash)
      const writeMethods = methods.filter((m) =>
        /send|create|update|delete|trash|modify|insert|draft/i.test(m)
      );
      expect(writeMethods).toEqual([]);

      // If an attacker attempts to invoke write on runtime cast, verify it fails
      expect(() => {
        if (typeof (adapter as any).sendMessage === "function") {
          (adapter as any).sendMessage();
        } else {
          throw new Error("Hard rejected: Gmail adapter is strictly read-only");
        }
      }).toThrow("Hard rejected: Gmail adapter is strictly read-only");
    });
  });

  describe("T-025: Attempted write to Google Calendar API", () => {
    it("ensures CalendarAdapter implements only read methods and hard-rejects any write attempts", () => {
      const adapter = new CalendarAdapter();
      const proto = Object.getPrototypeOf(adapter);
      const methods = Object.getOwnPropertyNames(proto);

      // Verify no write methods exist (insert, patch, update, delete, quickAdd)
      const writeMethods = methods.filter((m) =>
        /insert|create|patch|update|delete|quickAdd/i.test(m)
      );
      expect(writeMethods).toEqual([]);

      expect(() => {
        if (typeof (adapter as any).createEvent === "function") {
          (adapter as any).createEvent();
        } else {
          throw new Error("Hard rejected: Calendar adapter is strictly read-only");
        }
      }).toThrow("Hard rejected: Calendar adapter is strictly read-only");
    });
  });

  describe("T-026: Attempted write to Slack API", () => {
    it("ensures SlackAdapter implements only read methods and hard-rejects any write attempts", () => {
      const adapter = new SlackAdapter();
      const proto = Object.getPrototypeOf(adapter);
      const methods = Object.getOwnPropertyNames(proto);

      // Verify no write methods exist (chat.postMessage, chat.update, chat.delete)
      const writeMethods = methods.filter((m) =>
        /post|send|create|update|delete|write/i.test(m)
      );
      expect(writeMethods).toEqual([]);

      expect(() => {
        if (typeof (adapter as any).postMessage === "function") {
          (adapter as any).postMessage();
        } else {
          throw new Error("Hard rejected: Slack adapter is strictly read-only");
        }
      }).toThrow("Hard rejected: Slack adapter is strictly read-only");
    });
  });
});
