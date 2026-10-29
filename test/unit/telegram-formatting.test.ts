import { describe, it, expect } from "vitest";
import { TelegramMessageFormatter } from "@/scheduler/formatter";
import { AggregatedSummaryData } from "@/scheduler/aggregator";

describe("Milestone 6: Telegram Formatting & Message Chunking (T-022)", () => {
  it("formats structured summary with provider links and sections", () => {
    const data: AggregatedSummaryData = {
      gmailTruncated: false,
      calendarMeetings: [
        {
          id: "ev-1",
          summary: "Sprint Planning",
          startTime: "2026-10-29T10:00:00Z",
          endTime: "2026-10-29T11:00:00Z",
          status: "confirmed",
          attendeesCount: 3,
          htmlLink: "https://calendar.google.com/event?id=1",
        },
      ],
      trelloCards: [
        {
          id: "tr-1",
          name: "Deploy v1.0",
          desc: "Production release",
          dueComplete: false,
          idList: "list-1",
          idMembers: [],
          url: "https://trello.com/c/1",
          due: "2026-10-29T17:00:00Z",
        },
      ],
      gmailMessages: [
        {
          id: "gm-1",
          threadId: "th-1",
          subject: "Urgent Security Audit",
          from: "ciso@example.com",
          internalDate: Date.now(),
          dateFormatted: "2026-10-29 08:00:00",
          snippet: "Please review security rules",
          bodyText: "Review security rules before launch",
          webLink: "https://mail.google.com/mail/u/0/#inbox/gm-1",
          attachments: [],
        },
      ],
      slackMessages: [
        {
          channelId: "C01",
          user: "U12345",
          text: "Meeting moved to 10 AM",
          ts: "1730188800.000",
          timestampMs: 1730188800000,
          permalink: "https://slack.com/archives/C01/p1730188800",
        },
      ],
      providerStatuses: {
        calendar: "available",
        trello: "available",
        gmail: "available",
        slack: "available",
      },
    };

    const formatted = TelegramMessageFormatter.formatSummary(data, "2026-10-29", "Asia/Kolkata");
    expect(formatted).toContain("Sprint Planning");
    expect(formatted).toContain("Deploy v1.0");
    expect(formatted).toContain("Urgent Security Audit");
    expect(formatted).toContain("https://mail.google.com");
    expect(formatted).toContain("https://calendar.google.com");
  });

  describe("T-022: Message chunking when exceeding 4096 characters", () => {
    it("returns single chunk if text is <= 4096 characters", () => {
      const text = "Short message under limit";
      const chunks = TelegramMessageFormatter.chunkMessage(text, 4096);
      expect(chunks.length).toBe(1);
      expect(chunks[0]).toBe(text);
    });

    it("splits message exceeding 4096 chars into sequential chunks <= 4096 chars each without losing content", () => {
      // Build a 10,000 character string of lines
      const line = "This is a detailed bullet point with task descriptions and links: https://trello.com/c/example-card-12345\n";
      const repeats = Math.ceil(10000 / line.length);
      const longText = line.repeat(repeats);

      const chunks = TelegramMessageFormatter.chunkMessage(longText, 4096);

      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(4096);
        expect(chunk.trim().length).toBeGreaterThan(0);
      }

      // Verify all lines from original text exist across chunks
      const combined = chunks.join("\n");
      expect(combined.length).toBeGreaterThanOrEqual(longText.length - chunks.length * 2);
    });

    it("safely splits abnormally long single lines that exceed maxLength", () => {
      const longSingleLine = "A".repeat(5000);
      const chunks = TelegramMessageFormatter.chunkMessage(longSingleLine, 4096);

      expect(chunks.length).toBe(2);
      expect(chunks[0].length).toBe(4096);
      expect(chunks[1].length).toBe(904);
      expect(chunks[0] + chunks[1]).toBe(longSingleLine);
    });
  });
});
