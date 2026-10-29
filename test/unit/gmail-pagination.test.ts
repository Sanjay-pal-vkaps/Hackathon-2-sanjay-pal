import { describe, it, expect } from "vitest";
import { GmailAdapter } from "@/adapters/gmail-adapter";

describe("Milestone 2: Gmail Adapter Lookback & Pagination Cap", () => {
  const fixedNow = new Date("2026-10-29T10:00:00.000Z");

  it("builds exact epoch timestamp query avoiding coarse date midnight boundaries", () => {
    const { fullQuery, lookbackEpochSec, lookbackMs } = GmailAdapter.buildRollingQuery("project alpha", 24, fixedNow);

    const expectedEpochSec = Math.floor(new Date("2026-10-28T10:00:00.000Z").getTime() / 1000);
    expect(lookbackEpochSec).toBe(expectedEpochSec);
    expect(fullQuery).toBe(`project alpha after:${expectedEpochSec}`);
  });

  it("T-005: strictly filters out messages older than rolling 24 hours via internalDate", async () => {
    const withinWindowMs = fixedNow.getTime() - 2 * 3600 * 1000; // 2 hours ago
    const outsideWindowMs = fixedNow.getTime() - 26 * 3600 * 1000; // 26 hours ago (outside rolling 24h)

    const mockMessages = [
      {
        id: "msg-1",
        internalDate: withinWindowMs,
        subject: "Urgent: Project Update",
        from: "lead@example.com",
        snippet: "Please see attached task",
      },
      {
        id: "msg-2",
        internalDate: outsideWindowMs,
        subject: "Older Meeting Notes",
        from: "past@example.com",
        snippet: "Notes from 26 hours ago",
      },
    ];

    const mockFetcher = async () => ({
      messages: mockMessages,
      nextPageToken: undefined,
    });

    const result = await GmailAdapter.searchAndRead({
      now: fixedNow,
      rollingHours: 24,
      fetcher: mockFetcher,
    });

    expect(result.messages.length).toBe(1);
    expect(result.messages[0].id).toBe("msg-1");
    expect(result.isTruncated).toBe(false);
  });

  it("T-005: enforces 100-message cap and surfaces visible truncation warning", async () => {
    // Generate 120 messages
    const mockMessages = Array.from({ length: 120 }, (_, idx) => ({
      id: `msg-${idx + 1}`,
      internalDate: fixedNow.getTime() - 1000 * (idx + 1), // all within last hour
      subject: `Email #${idx + 1}`,
      from: `user${idx + 1}@example.com`,
    }));

    let pageCallCount = 0;
    const mockFetcher = async (url: string) => {
      pageCallCount++;
      if (url.includes("maxResults=50") && !url.includes("pageToken=")) {
        return {
          messages: mockMessages.slice(0, 50),
          nextPageToken: "token-page-2",
        };
      } else if (url.includes("pageToken=token-page-2")) {
        return {
          messages: mockMessages.slice(50, 100),
          nextPageToken: "token-page-3", // remaining items exist beyond 100
        };
      }
      return { messages: [], nextPageToken: undefined };
    };

    const result = await GmailAdapter.searchAndRead({
      now: fixedNow,
      maxResultsCap: 100,
      fetcher: mockFetcher,
    });

    expect(result.messages.length).toBe(100);
    expect(result.isTruncated).toBe(true);
    expect(result.truncationNotice).toContain("Inbox volume exceeded 100 recent emails");
    expect(pageCallCount).toBe(2); // Stopped cleanly at cap
  });
});
