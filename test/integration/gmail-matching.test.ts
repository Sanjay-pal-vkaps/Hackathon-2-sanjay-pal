import { describe, it, expect } from "vitest";
import { GmailMatcher } from "@/workflow/gmail-matcher";
import { SlackSearchClues } from "@/workflow/slack-parser";
import { GmailMessageSummary } from "@/adapters/gmail-adapter";

describe("Milestone 6 Integration: Gmail Matching & Clarification Flows (T-006, T-007)", () => {
  const createMockEmail = (id: string, subject: string, sender: string): GmailMessageSummary => ({
    id,
    threadId: `th-${id}`,
    internalDate: Date.now(),
    dateFormatted: "2026-10-29 08:00:00",
    subject,
    from: sender,
    snippet: `Snippet for ${subject}`,
    bodyText: `Body text for ${subject}`,
    webLink: `https://mail.google.com/mail/u/0/#inbox/${id}`,
    attachments: [],
  });

  describe("T-007: Zero Gmail matches (0 emails)", () => {
    it("returns zero matches notice with search terms and does not propose a task", async () => {
      const mockFetcher = async () => ({ messages: [], resultSizeEstimate: 0 });

      const clues: SlackSearchClues = {
        channelId: "C123",
        sender: "U123",
        text: "Please track the email about unknown-client-request-999",
        keywords: ["unknown-client-request-999"],
        mentionedEmails: [],
        referencedFiles: [],
        timestamp: "1730188800.000",
      };

      const result = await GmailMatcher.matchFromSlackClues(clues, {
        gmailFetcher: mockFetcher,
        sessionId: "s1",
      });

      expect(result.status).toBe("zero");
      expect(result.matchedMessages).toHaveLength(0);
      expect(result.clarificationPrompt).toBeDefined();
      expect(result.clarificationPrompt).toContain("No matching emails found");
      expect(result.clarificationPrompt).toContain("unknown-client-request-999");
      expect(result.candidateOptions).toBeUndefined();
    });
  });

  describe("Single Gmail match (1 email)", () => {
    it("returns exact match directly for task extraction without clarification menu", async () => {
      const email = createMockEmail("m1", "Production Incident #404", "devops@example.com");
      const mockFetcher = async (url: string) => {
        if (url.includes("/messages?")) {
          return { messages: [{ id: "m1", threadId: "th-m1" }], resultSizeEstimate: 1 };
        }
        return {
          id: "m1",
          threadId: "th-m1",
          internalDate: String(Date.now()),
          snippet: email.snippet,
          payload: {
            headers: [
              { name: "Subject", value: email.subject },
              { name: "From", value: email.from },
            ],
            body: { data: Buffer.from(email.bodyText).toString("base64url") },
          },
        };
      };

      const clues: SlackSearchClues = {
        channelId: "C123",
        sender: "U123",
        text: "Please create card for the production incident email",
        keywords: ["incident", "production"],
        mentionedEmails: [],
        referencedFiles: [],
        timestamp: "1730188800.000",
      };

      const result = await GmailMatcher.matchFromSlackClues(clues, {
        gmailFetcher: mockFetcher,
        sessionId: "s2",
      });

      expect(result.status).toBe("exact");
      expect(result.matchedMessages).toHaveLength(1);
      expect(result.selectedMessage?.id).toBe("m1");
      expect(result.candidateOptions).toBeUndefined();
    });
  });

  describe("T-006: Multiple Gmail matches (>1 emails)", () => {
    it("sends interactive Telegram picker and does NOT propose a task until selection", async () => {
      const emails = [
        createMockEmail("m1", "Client Feedback - ACME Corp", "client1@acme.com"),
        createMockEmail("m2", "Client Feedback - Beta Project", "client2@beta.com"),
        createMockEmail("m3", "Client Feedback - Final Invoices", "finance@acme.com"),
      ];

      const mockFetcher = async (url: string) => {
        if (url.includes("/messages?")) {
          return {
            messages: emails.map((e) => ({ id: e.id, threadId: e.threadId })),
            resultSizeEstimate: 3,
          };
        }
        const id = url.split("/messages/")[1]?.split("?")[0];
        const match = emails.find((e) => e.id === id) || emails[0];
        return {
          id: match.id,
          threadId: match.threadId,
          internalDate: String(Date.now()),
          snippet: match.snippet,
          payload: {
            headers: [
              { name: "Subject", value: match.subject },
              { name: "From", value: match.from },
            ],
            body: { data: Buffer.from(match.bodyText).toString("base64url") },
          },
        };
      };

      const clues: SlackSearchClues = {
        channelId: "C123",
        sender: "U123",
        text: "Please track the client feedback email",
        keywords: ["client", "feedback"],
        mentionedEmails: [],
        referencedFiles: [],
        timestamp: "1730188800.000",
      };

      const result = await GmailMatcher.matchFromSlackClues(clues, {
        gmailFetcher: mockFetcher,
        sessionId: "sess-abc",
      });

      expect(result.status).toBe("multiple");
      expect(result.matchedMessages).toHaveLength(3);
      expect(result.clarificationPrompt).toBeDefined();
      expect(result.clarificationPrompt).toContain("Multiple matching emails found");
      expect(result.clarificationPrompt).toContain("(3)");

      // Verify compact callback options (e:<sessionId>:<index>)
      expect(result.candidateOptions).toBeDefined();
      expect(result.candidateOptions).toHaveLength(3);
      expect(result.candidateOptions![0].callbackToken).toBe("e:sess-abc:0");
      expect(result.candidateOptions![1].callbackToken).toBe("e:sess-abc:1");
      expect(result.candidateOptions![2].callbackToken).toBe("e:sess-abc:2");
    });
  });
});
